import { createInputDecoder, decodeInputChunk } from '../input/index.ts';
import { createTuiContext } from './context.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { completedExitFromSnapshot } from './exit.ts';
import { findWidgetFocusTarget, nextFocusPath, previousFocusPath } from './focus.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { commitFrame, dirtyRegionsForRenderCommit, renderCurrentFrame, resolveTuiTheme, setHostViewport } from './runtime-frame.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import type { InputEvent, MouseEvent as TerminalMouseEvent } from '../input/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { Frame } from './frame.ts';
import type { FocusPath } from './focus.ts';
import type { Rect } from './layout.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import type { RenderRegion, RenderRegionHitTarget } from './render.ts';
import type {
  TuiCommand,
  TuiContext,
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
  let terminalExit: TuiExit<TState> | undefined;
  let started = false;
  let disposed = false;
  const pendingMessages: PendingTuiMessage<TMessage>[] = [];
  const pendingChanges: TuiRuntimeChange<TState>[] = [];
  const changeWaiters: ((change: TuiRuntimeChange<TState>) => void)[] = [];
  const inputDecoder = createInputDecoder();
  const dispatchQueue = createSerializedDispatchQueue();
  const subscriptions = createTuiSubscriptionManager<TState, TMessage>({
    host: options.host,
    ...(options.app.definition.subscriptions === undefined
      ? {}
      : { subscriptions: options.app.definition.subscriptions }),
    dispatch(message, source) {
      void dispatchQueue.run(() => dispatchInternal(message, source));
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
        const message = messageForMouse(state, event);
        if (message === undefined) return { handled: false, state, frame };
        const nextState = await dispatchQueue.run(() => dispatchInternal(message, 'input'));
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
      const events = decodeOptions === undefined
        ? inputDecoder.decode(chunk)
        : decodeInputChunk(chunk, decodeOptions);
      return processInputEvents(events);
    },
    flushInput() {
      return processInputEvents(inputDecoder.flush());
    },
    resetInput() {
      inputDecoder.reset();
    },
    nextChange() {
      const next = pendingChanges.shift();
      if (next !== undefined) return Promise.resolve(next);
      return new Promise((resolve) => changeWaiters.push(resolve));
    },
    async dispose() {
      await disposeSubscriptions();
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
    }
  };
  return runtime;

  async function startInternal(): Promise<Frame> {
    if (started) {
      if (currentRender !== undefined) return currentRender.frame;
    }
    if (disposed) throw new Error('TUI runtime has been disposed.');
    started = true;
    const context = await createRuntimeContext('internal');
    currentState = await options.app.definition.init(context);
    await settleQueuedWork(context);
    const state = ensureState();
    const theme = resolveTuiTheme(options.theme, state);
    const render = renderCurrentFrame(options.app, state, context, currentFocusPath, options, stateVersion);
    storeCurrentRender(render);
    await commitFrame(options.host, undefined, render.frame, options.transcript, theme);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
    if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
    return render.frame;
  }

  async function dispatchInternal(message: TMessage, source: TuiMessageSource): Promise<TState> {
    await ensureStarted();
    const context = await createRuntimeContext('internal');
    enqueueMessage(message, source);
    await settleQueuedWork(context);
    const state = ensureState();
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const render = renderCurrentFrame(options.app, state, context, currentFocusPath, options, stateVersion);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    storeCurrentRender(render);
    updateCompletedExitSnapshot(render.frame);
    publishChange({ kind: 'frame', frame: render.frame });
    if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
    return ensureState();
  }

  async function resizeInternal(viewport: Parameters<TuiRuntime<TState, TMessage>['resize']>[0]): Promise<Frame> {
    const state = await ensureStarted();
    options.transcript?.record({ kind: 'input', event: { kind: 'resize', viewport } });
    setHostViewport(options.host, viewport);
    const context = await createRuntimeContext('internal');
    const theme = resolveTuiTheme(options.theme, state);
    const previousFrame = frameDiffBase(theme);
    const render = renderCurrentFrame(options.app, state, context, currentFocusPath, options, stateVersion);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    storeCurrentRender(render);
    publishChange({ kind: 'frame', frame: render.frame });
    return render.frame;
  }

  async function settleQueuedWork(context: TuiContext<TMessage>): Promise<void> {
    await drainQueuedMessages(context);
    if (terminalExit === undefined) await subscriptions.reconcile(ensureState());
    if (terminalExit === undefined) await drainQueuedMessages(context);
    if (terminalExit !== undefined) await disposeSubscriptions();
  }

  async function createRuntimeContext(source: TuiMessageSource): Promise<TuiContext<TMessage>> {
    return createTuiContext<TMessage>(
      options.host,
      (message) => {
        enqueueMessage(message, source);
      }
    );
  }

  async function disposeSubscriptions(): Promise<void> {
    await subscriptions.dispose();
  }

  function publishChange(change: TuiRuntimeChange<TState>): void {
    const waiter = changeWaiters.shift();
    if (waiter !== undefined) {
      waiter(change);
      return;
    }
    pendingChanges.push(change);
  }

  async function processInputEvents(events: readonly InputEvent[]): Promise<readonly TuiInputResult<TState>[]> {
    const results: TuiInputResult<TState>[] = [];
    for (const event of events) {
      const result = await runtime.handleInput(event);
      results.push(result);
      if (result.exit !== undefined) break;
    }
    return results;
  }

  async function applyMessage(item: PendingTuiMessage<TMessage>, context: TuiContext<TMessage>): Promise<void> {
    if (item.source !== 'internal') {
      options.transcript?.record({ kind: 'message', source: item.source, message: item.message });
    }
    const state = ensureState();
    const result = await options.app.definition.update(state, item.message, context);
    currentState = result.state;
    stateVersion += 1;
    for (const command of result.commands ?? []) {
      if (terminalExit !== undefined) break;
      await applyCommand(command, context);
    }
    if (result.exit !== undefined) {
      terminalExit = completedExitFromSnapshot(
        ensureState(),
        currentRender?.frame.accessibility ?? tuiSnapshot(options.app.id),
        result.exit.reason
      );
    }
  }

  function updateCompletedExitSnapshot(frame: Frame): void {
    if (terminalExit?.status === 'completed') {
      terminalExit = { ...terminalExit, state: ensureState(), snapshot: frame.accessibility };
    }
  }

  async function applyCommand(command: TuiCommand<TMessage>, context: TuiContext<TMessage>): Promise<void> {
    await applyMessage({ message: command.message, source: 'internal' }, context);
  }

  function enqueueMessage(message: TMessage, source: TuiMessageSource): void {
    pendingMessages.push({ message, source });
  }

  async function drainQueuedMessages(context: TuiContext<TMessage>): Promise<void> {
    while (terminalExit === undefined && pendingMessages.length > 0) {
      const message = pendingMessages.shift();
      if (message !== undefined) await applyMessage(message, context);
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

  function storeCurrentRender(render: RenderCommitCandidate<TMessage>): void {
    currentRender = render;
    currentFocusPath = render.frame.focusPath;
  }

  async function moveFocus(state: TState, direction: 'next' | 'previous'): Promise<Frame> {
    const context = await createRuntimeContext('internal');
    const current = ensureRender();
    const theme = resolveTuiTheme(options.theme, state);
    currentFocusPath = direction === 'next'
      ? nextFocusPath(current.layout, currentFocusPath)
      : previousFocusPath(current.layout, currentFocusPath);
    const render = renderCurrentFrame(options.app, state, context, currentFocusPath, options, stateVersion);
    const previousFrame = frameDiffBase(theme);
    await commitFrame(options.host, previousFrame, render.frame, options.transcript, theme, dirtyCommitOptions(previousFrame, render));
    storeCurrentRender(render);
    publishChange({ kind: 'frame', frame: render.frame });
    return render.frame;
  }

  function messageForInput(_state: TState, event: InputEvent): TMessage | undefined {
    const key = inputEventKey(event);
    const current = ensureRender();
    const focused = findWidgetFocusTarget(current.widget, current.layout, currentFocusPath);
    if (event.kind === 'text') {
      const mapped = focused?.widget.inputMap?.text?.(event.text);
      if (mapped !== undefined) return mapped;
    }
    if (event.kind === 'paste') return focused?.widget.inputMap?.paste?.(event.text);
    if (key === undefined) return undefined;
    return focused?.widget.keyMap?.[key];
  }

  function messageForMouse(_state: TState, event: TerminalMouseEvent): TMessage | undefined {
    const current = ensureRender();
    const hit = regionHitsAt(current.regions, event.row, event.column)
      .toSorted((left, right) =>
        right.zIndex - left.zIndex
        || right.region.zIndex - left.region.zIndex
        || right.region.order - left.region.order
        || right.index - left.index
      )
      .at(0)?.hitTarget;
    if (hit === undefined) return undefined;
    return hit.message;
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

function regionHitsAt<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  row: number,
  column: number
): readonly {
    readonly hitTarget: RenderRegionHitTarget<TMessage>;
    readonly region: RenderRegion<TMessage>;
    readonly index: number;
    readonly zIndex: number;
  }[] {
  return regions.flatMap((region) =>
    region.hitTargets
      .filter((hitTarget) => containsPoint(hitTarget.bounds, row, column))
      .map((hitTarget, index) => ({
        hitTarget,
        region,
        index,
        zIndex: hitTarget.zIndex ?? region.zIndex
      }))
  );
}

function inputEventKey(event: InputEvent): string | undefined {
  if (event.kind === 'key') return event.key;
  if (event.kind === 'text') return event.text;
  return undefined;
}

function containsPoint(bounds: Rect, row: number, column: number): boolean {
  return row >= bounds.row
    && row < bounds.row + bounds.height
    && column >= bounds.column
    && column < bounds.column + bounds.width;
}
