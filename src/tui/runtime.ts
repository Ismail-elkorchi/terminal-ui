import { createInputDecoder, decodeInputChunk, isCancelKey, isInterruptKey } from '../input/index.ts';
import { createTuiContext } from './context.ts';
import { collectWidgetLayoutTargets, findWidgetFocusTarget, nextFocusPath, previousFocusPath } from './focus.ts';
import { layoutWidget } from './layout.ts';
import { completedExitFromSnapshot, exitWithStatus } from './exit.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { commitFrame, renderCurrentFrame, setHostViewport } from './runtime-frame.ts';
import type { InputEvent, MouseEvent as TerminalMouseEvent } from '../input/index.ts';
import type { FocusPath } from './focus.ts';
import type { Rect } from './layout.ts';
import type { Frame } from './frame.ts';
import type {
  TuiCommand,
  TuiContext,
  TuiExit,
  TuiInputResult,
  TuiRuntime,
  TuiRuntimeOptions
} from './types.ts';

export function createTuiRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>
): TuiRuntime<TState, TMessage> {
  let currentState: TState | undefined;
  let currentFrame: Frame | undefined;
  let currentFocusPath: FocusPath | undefined = options.initialFocusPath;
  let terminalExit: TuiExit<TState> | undefined;
  let started = false;
  const pendingMessages: TMessage[] = [];
  const inputDecoder = createInputDecoder();

  const runtime: TuiRuntime<TState, TMessage> = {
    app: options.app,
    host: options.host,
    async start() {
      if (started) {
        if (currentFrame !== undefined) return currentFrame;
      }
      started = true;
      const context = await createTuiContext<TMessage>(options.host, enqueueMessage);
      currentState = await options.app.definition.init(context);
      await drainQueuedMessages(context);
      if (terminalExit === undefined) await applySubscriptions(context);
      if (terminalExit === undefined) await drainQueuedMessages(context);
      const frame = renderCurrentFrame(options.app, ensureState(), context, currentFocusPath);
      currentFrame = frame;
      currentFocusPath = frame.focusPath;
      await commitFrame(options.host, undefined, frame, options.transcript);
      updateCompletedExitSnapshot(frame);
      return frame;
    },
    async dispatch(message) {
      await ensureStarted();
      const context = await createTuiContext<TMessage>(options.host, enqueueMessage);
      enqueueMessage(message);
      await drainQueuedMessages(context);
      if (terminalExit === undefined) await applySubscriptions(context);
      if (terminalExit === undefined) await drainQueuedMessages(context);
      const frame = renderCurrentFrame(options.app, ensureState(), context, currentFocusPath);
      await commitFrame(options.host, currentFrame, frame, options.transcript);
      currentFrame = frame;
      currentFocusPath = frame.focusPath;
      updateCompletedExitSnapshot(frame);
      return ensureState();
    },
    async resize(viewport) {
      const state = await ensureStarted();
      options.transcript?.record({ kind: 'input', event: { kind: 'resize', viewport } });
      setHostViewport(options.host, viewport);
      const context = await createTuiContext<TMessage>(options.host, enqueueMessage);
      const frame = renderCurrentFrame(options.app, state, context, currentFocusPath);
      await commitFrame(options.host, currentFrame, frame, options.transcript);
      currentFrame = frame;
      currentFocusPath = frame.focusPath;
      return frame;
    },
    async handleInput(event) {
      const state = await ensureStarted();
      const frame = ensureFrame();
      if (event.kind !== 'resize') options.transcript?.record({ kind: 'input', event });
      if (isInterruptKey(event)) {
        terminalExit = exitWithStatus('interrupted', state, frame);
        return { handled: true, state, frame, exit: terminalExit };
      }
      if (isCancelKey(event)) {
        terminalExit = exitWithStatus('cancelled', state, frame);
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
        if (message === undefined) {
          return { handled: false, state, frame };
        }
        const nextState = await runtime.dispatch(message);
        const nextFrame = ensureFrame();
        return terminalExit === undefined
          ? { handled: true, state: nextState, frame: nextFrame }
          : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
      }
      const message = await messageForInput(state, event);
      if (message === undefined) {
        return { handled: false, state, frame };
      }
      const nextState = await runtime.dispatch(message);
      const nextFrame = ensureFrame();
      return terminalExit === undefined
        ? { handled: true, state: nextState, frame: nextFrame }
        : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
    },
    async handleInputChunk(chunk, decodeOptions) {
      const events = decodeOptions === undefined
        ? inputDecoder.decode(chunk)
        : decodeInputChunk(chunk, decodeOptions);
      return processInputEvents(events);
    },
    async flushInput() {
      return processInputEvents(inputDecoder.flush());
    },
    resetInput() {
      inputDecoder.reset();
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

  async function processInputEvents(events: readonly InputEvent[]): Promise<readonly TuiInputResult<TState>[]> {
    const results: TuiInputResult<TState>[] = [];
    for (const event of events) {
      const result = await runtime.handleInput(event);
      results.push(result);
      if (result.exit !== undefined) break;
    }
    return results;
  }

  async function applyMessage(message: TMessage, context: TuiContext<TMessage>): Promise<void> {
    const state = ensureState();
    const result = await options.app.definition.update(state, message, context);
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

  async function applySubscriptions(context: TuiContext<TMessage>): Promise<void> {
    const commands = options.app.definition.subscriptions?.(ensureState()) ?? [];
    if (commands.length === 0) return;
    for (const command of commands) {
      if (terminalExit !== undefined) break;
      await applyCommand(command, context);
    }
  }

  async function applyCommand(command: TuiCommand<TMessage>, context: TuiContext<TMessage>): Promise<void> {
    await applyMessage(command.message, context);
  }

  function enqueueMessage(message: TMessage): void {
    pendingMessages.push(message);
  }

  async function drainQueuedMessages(context: TuiContext<TMessage>): Promise<void> {
    while (terminalExit === undefined && pendingMessages.length > 0) {
      const message = pendingMessages.shift();
      if (message !== undefined) await applyMessage(message, context);
    }
  }

  async function ensureStarted(): Promise<TState> {
    if (!started || currentState === undefined) {
      await runtime.start();
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
    const context = await createTuiContext<TMessage>(options.host, enqueueMessage);
    const widget = options.app.definition.view(state, context);
    const layout = layoutWidget(widget, context.viewport);
    currentFocusPath = direction === 'next'
      ? nextFocusPath(layout, currentFocusPath)
      : previousFocusPath(layout, currentFocusPath);
    const frame = renderCurrentFrame(options.app, state, context, currentFocusPath);
    await commitFrame(options.host, currentFrame, frame, options.transcript);
    currentFrame = frame;
    currentFocusPath = frame.focusPath;
    return frame;
  }

  async function messageForInput(state: TState, event: InputEvent): Promise<TMessage | undefined> {
    const key = inputEventKey(event);
    if (key === undefined) return undefined;
    const context = await createTuiContext<TMessage>(options.host, enqueueMessage);
    const widget = options.app.definition.view(state, context);
    const layout = layoutWidget(widget, context.viewport);
    const focused = findWidgetFocusTarget(widget, layout, currentFocusPath);
    return focused?.widget.keyMap?.[key];
  }

  async function messageForMouse(state: TState, event: TerminalMouseEvent): Promise<TMessage | undefined> {
    const context = await createTuiContext<TMessage>(options.host, enqueueMessage);
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
