import { createInputDecoder, decodeInputChunk, isCancelKey, isInterruptKey } from '../input/index.ts';
import { createTuiContext } from './context.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { completedExitFromSnapshot, exitWithStatus } from './exit.ts';
import { collectWidgetLayoutTargets, findWidgetFocusTarget, nextFocusPath, previousFocusPath } from './focus.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { layoutWidget } from './layout.ts';
import { commitFrame, renderCurrentFrame, setHostViewport } from './runtime-frame.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import type { InputEvent, MouseEvent as TerminalMouseEvent } from '../input/index.ts';
import type { Frame } from './frame.ts';
import type { FocusPath } from './focus.ts';
import type { Rect } from './layout.ts';
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
  let currentFrame: Frame | undefined;
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
      if (isInterruptKey(event)) {
        terminalExit = exitWithStatus('interrupted', state, frame);
        await disposeSubscriptions();
        publishChange({ kind: 'exit', exit: terminalExit });
        return { handled: true, state, frame, exit: terminalExit };
      }
      if (isCancelKey(event)) {
        terminalExit = exitWithStatus('cancelled', state, frame);
        await disposeSubscriptions();
        publishChange({ kind: 'exit', exit: terminalExit });
        return { handled: true, state, frame, exit: terminalExit };
      }
      if (event.kind === 'resize') {
        const resized = await runtime.resize(event.viewport);
        return { handled: true, state: ensureState(), frame: resized };
      }
      if (event.kind === 'key' && event.key === 'tab') {
        const next = await moveFocus(state, event.shift ? 'previous' : 'next');
        return { handled: true, state, frame: next };
      }
      if (event.kind === 'mouse') {
        const message = await messageForMouse(state, event);
        if (message === undefined) return { handled: false, state, frame };
        const nextState = await dispatchQueue.run(() => dispatchInternal(message, 'input'));
        const nextFrame = ensureFrame();
        return terminalExit === undefined
          ? { handled: true, state: nextState, frame: nextFrame }
          : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
      }
      const message = await messageForInput(state, event);
      if (message === undefined) return { handled: false, state, frame };
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
      return currentFrame;
    },
    exit() {
      return terminalExit;
    }
  };
  return runtime;

  async function startInternal(): Promise<Frame> {
    if (started) {
      if (currentFrame !== undefined) return currentFrame;
    }
    if (disposed) throw new Error('TUI runtime has been disposed.');
    started = true;
    const context = await createRuntimeContext('internal');
    currentState = await options.app.definition.init(context);
    await settleQueuedWork(context);
    const frame = renderCurrentFrame(options.app, ensureState(), context, currentFocusPath);
    currentFrame = frame;
    currentFocusPath = frame.focusPath;
    await commitFrame(options.host, undefined, frame, options.transcript);
    updateCompletedExitSnapshot(frame);
    publishChange({ kind: 'frame', frame });
    if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
    return frame;
  }

  async function dispatchInternal(message: TMessage, source: TuiMessageSource): Promise<TState> {
    await ensureStarted();
    const context = await createRuntimeContext('internal');
    enqueueMessage(message, source);
    await settleQueuedWork(context);
    const frame = renderCurrentFrame(options.app, ensureState(), context, currentFocusPath);
    await commitFrame(options.host, currentFrame, frame, options.transcript);
    currentFrame = frame;
    currentFocusPath = frame.focusPath;
    updateCompletedExitSnapshot(frame);
    publishChange({ kind: 'frame', frame });
    if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
    return ensureState();
  }

  async function resizeInternal(viewport: Parameters<TuiRuntime<TState, TMessage>['resize']>[0]): Promise<Frame> {
    const state = await ensureStarted();
    options.transcript?.record({ kind: 'input', event: { kind: 'resize', viewport } });
    setHostViewport(options.host, viewport);
    const context = await createRuntimeContext('internal');
    const frame = renderCurrentFrame(options.app, state, context, currentFocusPath);
    await commitFrame(options.host, currentFrame, frame, options.transcript);
    currentFrame = frame;
    currentFocusPath = frame.focusPath;
    publishChange({ kind: 'frame', frame });
    return frame;
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
    for (const command of result.commands ?? []) {
      if (terminalExit !== undefined) break;
      await applyCommand(command, context);
    }
    if (result.exit !== undefined) {
      terminalExit = completedExitFromSnapshot(
        ensureState(),
        currentFrame?.accessibility ?? tuiSnapshot(options.app.id),
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
    if (currentFrame === undefined) {
      throw new Error('TUI runtime does not have a frame.');
    }
    return currentFrame;
  }

  async function moveFocus(state: TState, direction: 'next' | 'previous'): Promise<Frame> {
    const context = await createRuntimeContext('internal');
    const widget = options.app.definition.view(state, context);
    const layout = layoutWidget(widget, context.viewport);
    currentFocusPath = direction === 'next'
      ? nextFocusPath(layout, currentFocusPath)
      : previousFocusPath(layout, currentFocusPath);
    const frame = renderCurrentFrame(options.app, state, context, currentFocusPath);
    await commitFrame(options.host, currentFrame, frame, options.transcript);
    currentFrame = frame;
    currentFocusPath = frame.focusPath;
    publishChange({ kind: 'frame', frame });
    return frame;
  }

  async function messageForInput(state: TState, event: InputEvent): Promise<TMessage | undefined> {
    const key = inputEventKey(event);
    if (key === undefined) return undefined;
    const context = await createRuntimeContext('internal');
    const widget = options.app.definition.view(state, context);
    const layout = layoutWidget(widget, context.viewport);
    const focused = findWidgetFocusTarget(widget, layout, currentFocusPath);
    return focused?.widget.keyMap?.[key];
  }

  async function messageForMouse(state: TState, event: TerminalMouseEvent): Promise<TMessage | undefined> {
    const context = await createRuntimeContext('internal');
    const widget = options.app.definition.view(state, context);
    const layout = layoutWidget(widget, context.viewport);
    const targets = collectWidgetLayoutTargets(widget, layout)
      .filter((target) => containsPoint(target.bounds, event.row, event.column))
      .reverse();
    for (const target of targets) {
      const message = target.widget.mouseMap?.[event.action];
      if (message !== undefined) return message;
    }
    return undefined;
  }
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
