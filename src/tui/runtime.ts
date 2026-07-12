import { createInputPipeline } from '../input/index.ts';
import { createTuiContext } from './context.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createTuiEffectManager } from './effects.ts';
import { completedExitFromSnapshot } from './exit.ts';
import { findAnyLayoutFocusTarget, findRenderNodeFocusTarget, nextFocusPath, previousFocusPath } from './focus.ts';
import { resolveTuiKeyBinding } from './key-bindings.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { createPointerRouter } from './pointer-router.ts';
import { commitFrame, dirtyRegionsForRenderCommit, renderCurrentFrame, resolveTuiTheme, setHostViewport } from './runtime-frame.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import type { InputEvent, MouseEvent as TerminalMouseEvent } from '../input/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { Frame } from './frame.ts';
import type { FocusPath } from './focus.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import type {
  TuiContext,
  TuiEffect,
  TuiExit,
  TuiInputResult,
  TuiMessageSource,
  TuiRuntime,
  TuiRuntimeChange,
  TuiRuntimeOptions
} from './types.ts';

interface PendingTuiMessage<TMessage> {
  readonly message: TMessage;
  readonly source: TuiMessageSource;
}

export function createTuiRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>
): TuiRuntime<TState, TMessage> {
  let currentState: TState | undefined;
  let currentRender: RenderCommitCandidate<TMessage> | undefined;
  let stateVersion = 0;
  let currentFocusPath: FocusPath | undefined = options.initialFocusPath;
  let focusReturnPaths: FocusPath[] = [];
  let terminalExit: TuiExit<TState> | undefined;
  let started = false;
  let disposed = false;
  const runtimeDiagnostics = [...(options.diagnostics ?? [])];
  let diagnosticRefreshQueued = false;
  let pendingFrameChange: Extract<TuiRuntimeChange<TState>, { readonly kind: 'frame' }> | undefined;
  let pendingExitChange: Extract<TuiRuntimeChange<TState>, { readonly kind: 'exit' }> | undefined;
  const changeWaiters: ((change: TuiRuntimeChange<TState>) => void)[] = [];
  const inputPipeline = createInputPipeline(options.input);
  const pointerRouter = createPointerRouter<TMessage>();
  const dispatchQueue = createSerializedDispatchQueue();
  const subscriptions = createTuiSubscriptionManager<TState, TMessage>({
    host: options.host,
    ...(options.app.definition.subscriptions === undefined
      ? {}
      : { subscriptions: options.app.definition.subscriptions }),
    diagnostics: () => runtimeDiagnostics,
    reportDiagnostic,
    dispatch(message, source) {
      return dispatchQueue.run(() => dispatchInternal(message, source)).then(() => undefined);
    }
  });
  const effects = createTuiEffectManager<TMessage>({
    host: options.host,
    diagnostics: () => runtimeDiagnostics,
    reportDiagnostic,
    dispatch(message) {
      return dispatchQueue.run(() => dispatchInternal(message, 'effect')).then(() => undefined);
    }
  });

  const runtime: TuiRuntime<TState, TMessage> = {
    app: options.app,
    host: options.host,
    start() {
      return dispatchQueue.run(startInternal);
    },
    dispatch(message) {
      return dispatchQueue.run(() => dispatchInternal(message, 'external'));
    },
    resize(viewport) {
      return dispatchQueue.run(() => resizeInternal(viewport));
    },
    async handleInput(event) {
      const state = await ensureStarted();
      const frame = ensureFrame();
      if (event.kind !== 'resize') options.transcript?.record({ kind: 'input', event });
      if (event.kind === 'resize') {
        const resized = await runtime.resize(event.viewport);
        return { handled: true, state: ensureState(), frame: resized };
      }
      if (event.kind === 'mouse') {
        const messages = messagesForMouse(state, event);
        if (messages.length === 0) return { handled: false, state, frame };
        const nextState = await dispatchQueue.run(() => dispatchManyInternal(messages, 'input'));
        const nextFrame = ensureFrame();
        return terminalExit === undefined
          ? { handled: true, state: nextState, frame: nextFrame }
          : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
      }
      const message = messageForInput(state, event);
      if (message === undefined) {
        if (event.kind === 'key' && event.key === 'tab') {
          const next = await moveFocus(state, event.shift ? 'previous' : 'next');
          return { handled: true, state, frame: next };
        }
        return { handled: false, state, frame };
      }
      const nextState = await dispatchQueue.run(() => dispatchInternal(message, 'input'));
      const nextFrame = ensureFrame();
      return terminalExit === undefined
        ? { handled: true, state: nextState, frame: nextFrame }
        : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
    },
    handleInputChunk(chunk, decodeOptions) {
      const events = inputPipeline.decode(chunk, decodeOptions);
      return processInputEvents(events);
    },
    flushInput() {
      return processInputEvents(inputPipeline.flush());
    },
    resetInput() {
      inputPipeline.reset();
      pointerRouter.reset();
    },
    nextChange() {
      const next = consumePendingChange();
      if (next !== undefined) return Promise.resolve(next);
      return new Promise((resolve) => changeWaiters.push(resolve));
    },
    async dispose() {
      subscriptions.cancel();
      effects.cancel();
      await dispatchQueue.drain();
      await subscriptions.dispose();
      await effects.dispose();
      disposed = true;
    },
    getState() {
      return currentState;
    },
    frame() {
      return currentRender?.frame;
    },
    exit() {
      return terminalExit;
    },
    diagnostics() {
      return [...runtimeDiagnostics];
    }
  };
  return runtime;

  async function startInternal(): Promise<Frame> {
    if (started) {
      if (currentRender !== undefined) return currentRender.frame;
    }
    if (disposed) throw new Error('TUI runtime has been disposed.');
    started = true;
    const context = await createRuntimeContext();
    currentState = options.app.definition.init(context);
    await subscriptions.reconcile(ensureState());
    const state = ensureState();
    const theme = resolveTuiTheme(options.theme, state);
    const render = renderFrameWithFocusRecovery(state, context);
    storeCurrentRender(render, currentFocusPath);
    await commitFrame(options.host, undefined, render.frame, options.transcript, theme);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
    if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
    return render.frame;
  }

  async function dispatchInternal(message: TMessage, source: TuiMessageSource): Promise<TState> {
    return dispatchManyInternal([message], source);
  }

  async function dispatchManyInternal(messages: readonly TMessage[], source: TuiMessageSource): Promise<TState> {
    await ensureStarted();
    const context = await createRuntimeContext();
    const pendingEffects: TuiEffect<TMessage>[] = [];
    const previousStateVersion = stateVersion;
    const previousExit = terminalExit;
    for (const message of messages) {
      if (terminalExit !== undefined) break;
      pendingEffects.push(...applyMessage({ message, source }, context));
    }
    if (terminalExit === undefined) await subscriptions.reconcile(ensureState());
    if (terminalExit !== undefined) {
      subscriptions.cancel();
      effects.cancel();
    }
    const exitChanged = terminalExit !== previousExit;
    if (stateVersion === previousStateVersion) {
      if (terminalExit === undefined) effects.start(pendingEffects);
      if (exitChanged && terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
      return ensureState();
    }
    const state = ensureState();
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const render = renderFrameWithFocusRecovery(state, context);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    storeCurrentRender(render, currentFocusPath);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
    if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
    if (terminalExit === undefined) effects.start(pendingEffects);
    return ensureState();
  }

  async function resizeInternal(viewport: Parameters<TuiRuntime<TState, TMessage>['resize']>[0]): Promise<Frame> {
    const state = await ensureStarted();
    options.transcript?.record({ kind: 'input', event: { kind: 'resize', viewport } });
    setHostViewport(options.host, viewport);
    const context = await createRuntimeContext();
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const render = renderFrameWithFocusRecovery(state, context);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    storeCurrentRender(render, currentFocusPath);
    publishChange({ kind: 'frame', frame: render.frame });
    return render.frame;
  }

  async function createRuntimeContext(): Promise<TuiContext> {
    return createTuiContext(options.host, runtimeDiagnostics);
  }

  function reportDiagnostic(item: TerminalDiagnostic): void {
    runtimeDiagnostics.push(item);
    options.transcript?.recordDiagnostic(item);
    if (!started || disposed || currentState === undefined || currentRender === undefined || diagnosticRefreshQueued) return;
    diagnosticRefreshQueued = true;
    void dispatchQueue.run(refreshAfterDiagnostic).finally(() => {
      diagnosticRefreshQueued = false;
    });
  }

  async function refreshAfterDiagnostic(): Promise<void> {
    if (disposed || currentState === undefined || currentRender === undefined) return;
    const state = currentState;
    const context = await createRuntimeContext();
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const render = renderFrameWithFocusRecovery(state, context);
    await commitFrame(
      options.host,
      previousFrame,
      render.frame,
      options.transcript,
      theme,
      dirtyCommitOptions(previousFrame, render)
    );
    storeCurrentRender(render, currentFocusPath);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
  }

  function publishChange(change: TuiRuntimeChange<TState>): void {
    const waiter = changeWaiters.shift();
    if (waiter !== undefined) {
      waiter(change);
      return;
    }
    if (change.kind === 'frame') {
      pendingFrameChange = change;
      return;
    }
    pendingExitChange = change;
  }

  function consumePendingChange(): TuiRuntimeChange<TState> | undefined {
    if (pendingFrameChange !== undefined) {
      const change = pendingFrameChange;
      pendingFrameChange = undefined;
      return change;
    }
    if (pendingExitChange !== undefined) {
      const change = pendingExitChange;
      pendingExitChange = undefined;
      return change;
    }
    return undefined;
  }

  async function processInputEvents(events: readonly InputEvent[]): Promise<readonly TuiInputResult<TState>[]> {
    const results: TuiInputResult<TState>[] = [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event === undefined) continue;
      if (isWheelInputEvent(event)) {
        const wheelEvents: TerminalMouseEvent[] = [event];
        for (;;) {
          const next = events[index + 1];
          if (!isWheelInputEvent(next)) break;
          wheelEvents.push(next);
          index += 1;
        }
        results.push(...await handleWheelInputBatch(wheelEvents));
        if (results.at(-1)?.exit !== undefined) break;
        continue;
      }
      const result = await runtime.handleInput(event);
      results.push(result);
      if (result.exit !== undefined) break;
    }
    return results;
  }

  async function handleWheelInputBatch(events: readonly TerminalMouseEvent[]): Promise<readonly TuiInputResult<TState>[]> {
    const state = await ensureStarted();
    const frame = ensureFrame();
    for (const event of events) {
      options.transcript?.record({ kind: 'input', event });
    }
    const messages = events.flatMap((event) => messagesForMouse(state, event));
    if (messages.length === 0) {
      return events.map(() => ({ handled: false, state, frame }));
    }
    const nextState = await dispatchQueue.run(() => dispatchManyInternal(messages, 'input'));
    const nextFrame = ensureFrame();
    return events.map(() => terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit });
  }

  function applyMessage(
    item: PendingTuiMessage<TMessage>,
    context: TuiContext
  ): readonly TuiEffect<TMessage>[] {
    options.transcript?.record({ kind: 'message', source: item.source, message: item.message });
    const state = ensureState();
    const result = options.app.definition.update(state, item.message, context);
    currentState = result.state;
    if (result.state !== state) stateVersion += 1;
    if (result.exit !== undefined) {
      terminalExit = {
        ...completedExitFromSnapshot(
          ensureState(),
          currentRender?.frame.accessibility ?? tuiSnapshot(options.app.id),
          result.exit.reason
        ),
        diagnostics: [...runtimeDiagnostics]
      };
    }
    return result.effects ?? [];
  }

  function updateCompletedExitSnapshot(frame: Frame): void {
    if (terminalExit?.status === 'completed') {
      terminalExit = {
        ...terminalExit,
        state: ensureState(),
        diagnostics: [...runtimeDiagnostics],
        snapshot: frame.accessibility
      };
    }
  }

  async function ensureStarted(): Promise<TState> {
    if (!started || currentState === undefined) {
      await startInternal();
    }
    if (currentState === undefined) {
      throw new Error('TUI runtime did not initialize state.');
    }
    return currentState;
  }

  function ensureState(): TState {
    if (currentState === undefined) {
      throw new Error('TUI runtime does not have state.');
    }
    return currentState;
  }

  function ensureFrame(): Frame {
    if (currentRender === undefined) {
      throw new Error('TUI runtime does not have a frame.');
    }
    return currentRender.frame;
  }

  function ensureRender(): RenderCommitCandidate<TMessage> {
    if (currentRender === undefined) {
      throw new Error('TUI runtime does not have a committed render.');
    }
    return currentRender;
  }

  function renderFrameWithFocusRecovery(
    state: TState,
    context: TuiContext
  ): RenderCommitCandidate<TMessage> {
    const requestedFocusPath = currentFocusPath;
    const render = renderCurrentFrame(options.app, state, context, requestedFocusPath, options, stateVersion);
    const focusReturnPath = focusReturnPaths.at(-1);
    if (
      focusReturnPath === undefined
      || requestedFocusPath === undefined
      || sameFocusPath(render.frame.focusPath, requestedFocusPath)
    ) {
      return render;
    }
    const recovered = renderCurrentFrame(options.app, state, context, focusReturnPath, options, stateVersion);
    return sameFocusPath(recovered.frame.focusPath, focusReturnPath) ? recovered : render;
  }

  function storeCurrentRender(render: RenderCommitCandidate<TMessage>, requestedFocusPath: FocusPath | undefined): void {
    focusReturnPaths = focusReturnPaths.filter((path) => findAnyLayoutFocusTarget(render.layout, path) !== undefined);
    if (
      requestedFocusPath !== undefined
      && render.frame.focusPath !== undefined
      && !sameFocusPath(render.frame.focusPath, requestedFocusPath)
      && findAnyLayoutFocusTarget(render.layout, requestedFocusPath) !== undefined
      && !focusReturnPaths.some((path) => sameFocusPath(path, requestedFocusPath))
    ) {
      focusReturnPaths.push([...requestedFocusPath]);
    }
    if (
      focusReturnPaths.length > 0
      && sameFocusPath(render.frame.focusPath, focusReturnPaths.at(-1))
    ) {
      focusReturnPaths = focusReturnPaths.slice(0, -1);
    }
    currentRender = render;
    currentFocusPath = render.frame.focusPath;
  }

  async function moveFocus(state: TState, direction: 'next' | 'previous'): Promise<Frame> {
    const context = await createRuntimeContext();
    const current = ensureRender();
    const theme = resolveTuiTheme(options.theme, state);
    currentFocusPath = direction === 'next'
      ? nextFocusPath(current.layout, currentFocusPath)
      : previousFocusPath(current.layout, currentFocusPath);
    const render = renderFrameWithFocusRecovery(state, context);
    const previousFrame = frameDiffBase(theme);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    storeCurrentRender(render, currentFocusPath);
    publishChange({ kind: 'frame', frame: render.frame });
    return render.frame;
  }

  function messageForInput(_state: TState, event: InputEvent): TMessage | undefined {
    const beforeFocus = resolveTuiKeyBinding({
      bindings: options.app.definition.keyBindings,
      phase: 'beforeFocus',
      state: _state,
      event,
      focusPath: currentFocusPath
    });
    if (beforeFocus !== undefined) return beforeFocus;
    const current = ensureRender();
    const focused = findRenderNodeFocusTarget(current.node, current.layout, currentFocusPath);
    if (event.kind === 'text') {
      const mapped = focused?.renderNode.inputMap?.text?.(event.text);
      if (mapped !== undefined) return mapped;
    }
    if (event.kind === 'paste') return focused?.renderNode.inputMap?.paste?.(event.text);
    const focusedMessage = componentKeyMessage(focused?.renderNode.keyMap, event, currentFocusPath);
    if (focusedMessage !== undefined) return focusedMessage;
    const keyText = textFromUnmappedKey(event);
    if (keyText !== undefined) {
      const mapped = focused?.renderNode.inputMap?.text?.(keyText);
      if (mapped !== undefined) return mapped;
    }
    return resolveTuiKeyBinding({
      bindings: options.app.definition.keyBindings,
      phase: 'afterFocus',
      state: _state,
      event,
      focusPath: currentFocusPath
    });
  }

  function messagesForMouse(_state: TState, event: TerminalMouseEvent): readonly TMessage[] {
    const current = ensureRender();
    return pointerRouter.route(current.regions, event)
      .flatMap((result) => result.message === undefined ? [] : [result.message]);
  }

  function frameDiffBase(theme: TerminalTheme): Frame | undefined {
    return currentRender?.themeFingerprint === theme.fingerprint ? currentRender.frame : undefined;
  }

  function dirtyCommitOptions(
    previousFrame: Frame | undefined,
    render: RenderCommitCandidate<TMessage>
  ): { readonly dirtyRegions?: DirtyRegionSet } {
    if (previousFrame === undefined) return {};
    const dirtyRegions = dirtyRegionsForRenderCommit(currentRender, render);
    return dirtyRegions === undefined ? {} : { dirtyRegions };
  }
}

function componentKeyMessage<TMessage>(
  keyMap: RenderNode<TMessage>['keyMap'] | undefined,
  event: InputEvent,
  focusPath: FocusPath | undefined
): TMessage | undefined {
  const handler = event.kind === 'key' && event.key !== 'unknown'
    ? keyMap?.[event.key]
    : event.kind === 'text'
      ? keyMap?.text?.[event.text]
      : undefined;
  return handler?.({ input: event, focusPath: focusPath ?? [] });
}

function isWheelInputEvent(event: InputEvent | undefined): event is TerminalMouseEvent {
  return event?.kind === 'mouse' && event.action === 'wheel';
}

function textFromUnmappedKey(event: InputEvent): string | undefined {
  if (event.kind === 'key' && event.key === 'space') return ' ';
  return undefined;
}

function sameFocusPath(left: FocusPath | undefined, right: FocusPath | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
