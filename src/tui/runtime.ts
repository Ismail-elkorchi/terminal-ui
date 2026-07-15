import { createInputPipeline } from '../input/index.ts';
import { TerminalUiError } from '../errors.ts';
import { createTuiContext } from './context.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createTuiEffectManager } from './effects.ts';
import { completedExitFromSnapshot } from './exit.ts';
import {
  findAnyLayoutFocusTarget,
  activeFocusScopeRestores,
  findRenderNodeFocusTarget,
  renderNodeKeyChainForFocus,
  nextFocusPath,
  previousFocusPath
} from '../renderer/internal/focus.ts';
import { resolveTuiKeyBinding } from './key-bindings.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { createPointerRouter } from '../renderer/internal/pointer-router.ts';
import {
  assertRuntimeCanStart,
  assertRuntimeOperational,
  assertRuntimeWaitable,
  runtimePhaseError
} from './runtime-lifecycle.ts';
import { commitFrame, dirtyRegionsForRenderCommit, renderCurrentFrame, resolveTuiTheme } from './runtime-frame.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import {
  appendWheelInput,
  createWheelInputBatch,
  DEFAULT_WHEEL_BATCH_WINDOW_MS,
  wheelInputBatchAccepts
} from './wheel-input-batch.ts';
import type { InputEvent, MouseEvent as TerminalMouseEvent, MouseWheelEvent } from '../input/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderNode } from '../renderer/model/index.ts';
import type { DirtyRegionSet } from '../renderer/internal/dirty-regions.ts';
import type { Frame } from '../renderer/internal/frame.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import type { PointerRouteResult } from '../renderer/internal/pointer-router.ts';
import type { TuiRuntimePhase } from './runtime-lifecycle.ts';
import type {
  TuiContext,
  TuiEffect,
  TuiExit,
  TuiInputResult,
  TuiInputBatchResult,
  TuiMessageSource,
  TuiRuntime,
  TuiRuntimeChange,
  TuiRuntimeMetrics,
  TuiRuntimeOptions
} from './types.ts';
import type { WheelInputBatch } from './wheel-input-batch.ts';

interface PendingTuiMessage<TMessage> {
  readonly message: TMessage;
  readonly source: TuiMessageSource;
}

interface ChangeWaiter<TState> {
  readonly resolve: (change: TuiRuntimeChange<TState>) => void;
  readonly reject: (cause: unknown) => void;
  readonly detach: () => void;
}

interface PendingWheelInput<TState> {
  batch: WheelInputBatch;
  readonly controller: AbortController;
  completion: Promise<readonly TuiInputResult<TState>[]>;
}

type MutableTuiRuntimeMetrics = {
  -readonly [TKey in keyof TuiRuntimeMetrics]: TuiRuntimeMetrics[TKey];
};

export function createTuiRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>
): TuiRuntime<TState, TMessage> {
  let currentState: TState | undefined;
  let currentViewport = options.host.getViewport();
  let currentRender: RenderCommitCandidate<TMessage> | undefined;
  let stateVersion = 0;
  let currentFocusPath: FocusPath | undefined = options.initialFocusPath;
  let focusReturnPaths: FocusPath[] = [];
  let terminalExit: TuiExit<TState> | undefined;
  let phase: TuiRuntimePhase = 'created';
  let disposal: Promise<void> | undefined;
  const runtimeDiagnostics = [...(options.diagnostics ?? [])];
  let diagnosticRefreshQueued = false;
  let pendingFrameChange: Extract<TuiRuntimeChange<TState>, { readonly kind: 'frame' }> | undefined;
  let pendingExitChange: Extract<TuiRuntimeChange<TState>, { readonly kind: 'exit' }> | undefined;
  const changeWaiters: ChangeWaiter<TState>[] = [];
  const inputPipeline = createInputPipeline(options.input);
  const pointerRouter = createPointerRouter<TMessage>();
  let pendingWheelInput: PendingWheelInput<TState> | undefined;
  const metrics: MutableTuiRuntimeMetrics = {
    decodedInputEvents: 0,
    wheelPackets: 0,
    dispatchedMessages: 0,
    stateUpdates: 0,
    frameCommits: 0
  };
  const dispatchQueue = createSerializedDispatchQueue();
  const subscriptions = createTuiSubscriptionManager<TState, TMessage>({
    ...(options.app.definition.subscriptions === undefined
      ? {}
      : { subscriptions: options.app.definition.subscriptions }),
    context: createRuntimeContext,
    reportDiagnostic,
    dispatch(message, source) {
      return dispatchQueue.run(() => dispatchInternal(message, source)).then(() => undefined);
    }
  });
  const effects = createTuiEffectManager<TMessage>({
    context: createRuntimeContext,
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
    async resize(viewport) {
      await flushPendingWheelInput();
      return dispatchQueue.run(() => resizeInternal(viewport));
    },
    async handleInput(event) {
      await flushPendingWheelInput();
      metrics.decodedInputEvents += 1;
      return handleInputImmediately(event);
    },
    handleInputChunk(chunk, decodeOptions) {
      const events = inputPipeline.decode(chunk, decodeOptions);
      metrics.decodedInputEvents += events.length;
      return processInputEvents(events);
    },
    async flushInput() {
      const events = inputPipeline.flush();
      metrics.decodedInputEvents += events.length;
      const decoded = await processInputEvents(events);
      const pending = await flushPendingWheelInput();
      return [...decoded.results, ...pending];
    },
    resetInput() {
      assertRuntimeOperational(phase);
      inputPipeline.reset();
      resetPendingWheelInput();
      pointerRouter.reset();
    },
    nextChange(signal) {
      assertRuntimeWaitable(phase);
      const next = consumePendingChange();
      if (next !== undefined) return Promise.resolve(next);
      return waitForChange(signal);
    },
    dispose() {
      return disposeRuntime();
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
    },
    metrics() {
      return { ...metrics };
    }
  };
  return runtime;

  async function handleInputImmediately(event: InputEvent): Promise<TuiInputResult<TState>> {
    if (event.kind !== 'resize') options.transcript?.record({ kind: 'input', event });
    if (event.kind === 'mouse') {
      return dispatchQueue.run(() => handleMouseInputInternal(event));
    }
    const state = await ensureStarted();
    const frame = ensureFrame();
    if (event.kind === 'resize') {
      const resized = await runtime.resize(event.viewport);
      return { handled: true, state: ensureState(), frame: resized };
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
  }

  async function startInternal(): Promise<Frame> {
    assertRuntimeCanStart(phase);
    if (phase === 'active' && currentRender !== undefined) return currentRender.frame;
    phase = 'active';
    const context = await createRuntimeContext();
    currentState = options.app.definition.init(context);
    await subscriptions.reconcile(ensureState());
    const state = ensureState();
    const theme = resolveTuiTheme(options.theme, state);
    const render = renderFrameWithFocusRecovery(state, context);
    storeCurrentRender(render, currentFocusPath);
    await commitFrame(options.host, undefined, render.frame, options.transcript, theme);
    metrics.frameCommits += 1;
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
    await commitFrame(
      options.host,
      previousFrame,
      render.frame,
      options.transcript,
      theme,
      dirtyCommitOptions(previousFrame, render)
    );
    metrics.frameCommits += 1;
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
    currentViewport = viewport;
    const context = await createRuntimeContext();
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const render = renderFrameWithFocusRecovery(state, context);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    metrics.frameCommits += 1;
    storeCurrentRender(render, currentFocusPath);
    publishChange({ kind: 'frame', frame: render.frame });
    return render.frame;
  }

  async function createRuntimeContext(): Promise<TuiContext> {
    const context = await createTuiContext(options.host, runtimeDiagnostics);
    return { ...context, viewport: currentViewport };
  }

  function reportDiagnostic(item: TerminalDiagnostic): void {
    runtimeDiagnostics.push(item);
    options.transcript?.recordDiagnostic(item);
    if (phase !== 'active' || currentState === undefined || currentRender === undefined || diagnosticRefreshQueued) return;
    diagnosticRefreshQueued = true;
    void dispatchQueue.run(refreshAfterDiagnostic).finally(() => {
      diagnosticRefreshQueued = false;
    });
  }

  async function refreshAfterDiagnostic(): Promise<void> {
    if (phase !== 'active' || currentState === undefined || currentRender === undefined) return;
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
    metrics.frameCommits += 1;
    storeCurrentRender(render, currentFocusPath);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
  }

  function publishChange(change: TuiRuntimeChange<TState>): void {
    const waiter = changeWaiters.shift();
    if (waiter !== undefined) {
      waiter.detach();
      waiter.resolve(change);
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

  async function processInputEvents(events: readonly InputEvent[]): Promise<TuiInputBatchResult<TState>> {
    assertRuntimeOperational(phase);
    const results: TuiInputResult<TState>[] = [];
    for (const event of events) {
      if (isWheelInputEvent(event)) {
        results.push(...await enqueueWheelInput(event));
        if (results.at(-1)?.exit !== undefined) break;
        continue;
      }
      results.push(...await flushPendingWheelInput());
      const result = await handleInputImmediately(event);
      results.push(result);
      if (result.exit !== undefined) break;
    }
    return {
      results,
      ...(pendingWheelInput === undefined ? {} : { pending: pendingWheelInput.completion })
    };
  }

  async function enqueueWheelInput(event: MouseWheelEvent): Promise<readonly TuiInputResult<TState>[]> {
    await ensureStarted();
    metrics.wheelPackets += 1;
    options.transcript?.record({ kind: 'input', event });
    const targetId = pointerRouter.wheelTargetId(ensureRender().regions, event);
    const pending = pendingWheelInput;
    if (pending !== undefined && wheelInputBatchAccepts(pending.batch, event, targetId)) {
      pending.batch = appendWheelInput(pending.batch, event);
      return [];
    }
    const flushed = await flushPendingWheelInput();
    const controller = new AbortController();
    const next: PendingWheelInput<TState> = {
      batch: createWheelInputBatch(event, targetId),
      controller,
      completion: Promise.resolve([])
    };
    pendingWheelInput = next;
    next.completion = options.host.clock
      .sleep(DEFAULT_WHEEL_BATCH_WINDOW_MS, controller.signal)
      .then(() => flushWheelInput(next));
    return flushed;
  }

  function flushPendingWheelInput(): Promise<readonly TuiInputResult<TState>[]> {
    const pending = pendingWheelInput;
    if (pending === undefined) return Promise.resolve([]);
    pending.controller.abort();
    return pending.completion;
  }

  async function flushWheelInput(
    pending: PendingWheelInput<TState>
  ): Promise<readonly TuiInputResult<TState>[]> {
    if (pendingWheelInput !== pending) return [];
    pendingWheelInput = undefined;
    return dispatchQueue.run(() => handleWheelInputBatch(pending.batch));
  }

  function resetPendingWheelInput(): void {
    const pending = pendingWheelInput;
    pendingWheelInput = undefined;
    pending?.controller.abort();
  }

  async function handleWheelInputBatch(batch: WheelInputBatch): Promise<readonly TuiInputResult<TState>[]> {
    const state = await ensureStarted();
    const frame = ensureFrame();
    const messages = messagesForMouse(state, batch.event);
    if (messages.length === 0) {
      return [{ handled: false, state, frame }];
    }
    const nextState = await dispatchManyInternal(messages, 'input');
    const nextFrame = ensureFrame();
    return [terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit }];
  }

  async function handleMouseInputInternal(event: TerminalMouseEvent): Promise<TuiInputResult<TState>> {
    await ensureStarted();
    const previousRender = ensureRender();
    const routed = pointerRouter.route(previousRender.regions, event);
    const focusChanged = applyPointerFocus(event, routed);
    const messages = routed.flatMap((result) => result.message === undefined ? [] : [result.message]);
    if (messages.length > 0) await dispatchManyInternal(messages, 'input');
    if (focusChanged && currentRender === previousRender) {
      await commitFocusChangeInternal(ensureState());
    }
    const nextState = ensureState();
    const nextFrame = ensureFrame();
    const handled = focusChanged || messages.length > 0;
    return terminalExit === undefined
      ? { handled, state: nextState, frame: nextFrame }
      : { handled, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  function applyPointerFocus(
    event: TerminalMouseEvent,
    routed: readonly PointerRouteResult<TMessage>[]
  ): boolean {
    if (event.action !== 'press') return false;
    const intent = routed.find((result) => result.event.kind === 'pointerDown')?.hit?.focus;
    if (intent === undefined || intent.kind === 'preserve') return false;
    if (sameFocusPath(currentFocusPath, intent.path)) return false;
    currentFocusPath = [...intent.path];
    return true;
  }

  async function commitFocusChangeInternal(state: TState): Promise<Frame> {
    const context = await createRuntimeContext();
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const requestedFocusPath = currentFocusPath;
    const render = renderFrameWithFocusRecovery(state, context);
    await commitFrame(
      options.host,
      previousFrame,
      render.frame,
      options.transcript,
      theme,
      dirtyCommitOptions(previousFrame, render)
    );
    metrics.frameCommits += 1;
    storeCurrentRender(render, requestedFocusPath);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
    return render.frame;
  }

  function applyMessage(
    item: PendingTuiMessage<TMessage>,
    context: TuiContext
  ): readonly TuiEffect<TMessage>[] {
    options.transcript?.record({ kind: 'message', source: item.source, message: item.message });
    const state = ensureState();
    metrics.dispatchedMessages += 1;
    const result = options.app.definition.update(state, item.message, context);
    currentState = result.state;
    if (result.state !== state) {
      stateVersion += 1;
      metrics.stateUpdates += 1;
    }
    if (result.exit !== undefined) {
      phase = 'exiting';
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
    assertRuntimeOperational(phase);
    if (phase === 'created' || currentState === undefined) {
      await startInternal();
    }
    if (currentState === undefined) {
      throw new Error('TUI runtime did not initialize state.');
    }
    return currentState;
  }

  function waitForChange(signal: AbortSignal | undefined): Promise<TuiRuntimeChange<TState>> {
    return new Promise((resolve, reject) => {
      let abort = (): void => undefined;
      const waiter: ChangeWaiter<TState> = {
        resolve,
        reject,
        detach: () => signal?.removeEventListener('abort', abort)
      };
      abort = (): void => {
        const index = changeWaiters.indexOf(waiter);
        if (index >= 0) changeWaiters.splice(index, 1);
        waiter.detach();
        reject(new TerminalUiError('TUI runtime change wait was cancelled.'));
      };
      if (signal?.aborted === true) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      changeWaiters.push(waiter);
    });
  }

  function disposeRuntime(): Promise<void> {
    if (disposal !== undefined) return disposal;
    resetPendingWheelInput();
    phase = 'disposing';
    const unavailable = runtimePhaseError(phase);
    for (const waiter of changeWaiters.splice(0)) {
      waiter.detach();
      waiter.reject(unavailable);
    }
    pendingFrameChange = undefined;
    pendingExitChange = undefined;
    subscriptions.cancel();
    effects.cancel();
    disposal = (async () => {
      const failures: unknown[] = [];
      try {
        await dispatchQueue.drain();
      } catch (cause) {
        failures.push(cause);
      }
      const cleanups = await Promise.allSettled([subscriptions.dispose(), effects.dispose()]);
      for (const cleanup of cleanups) {
        if (cleanup.status === 'rejected') failures.push(cleanup.reason);
      }
      phase = 'disposed';
      if (failures.length > 0) throw new AggregateError(failures, 'TUI runtime disposal failed.');
    })();
    return disposal;
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
      && activeFocusScopeRestores(render.layout)
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
    metrics.frameCommits += 1;
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
    for (const renderNode of renderNodeKeyChainForFocus(current.node, current.layout, currentFocusPath)) {
      const focusedMessage = componentKeyMessage(renderNode.keyMap, event, currentFocusPath);
      if (focusedMessage !== undefined) return focusedMessage;
    }
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

function isWheelInputEvent(event: InputEvent | undefined): event is MouseWheelEvent {
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
