import { diagnostic } from '../diagnostics.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { completedExit, exitWithStatus } from './exit.ts';
import type { TerminalSignal, Unsubscribe } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TuiExit, TuiRuntime } from './types.ts';
import type { TuiInputResult } from './types.ts';

export async function runTuiInputLoop<TState, TMessage>(
  runtime: TuiRuntime<TState, TMessage>,
  transcript?: TranscriptRecorder
): Promise<TuiExit<TState>> {
  const inputController = new AbortController();
  const changeController = new AbortController();
  const input = runtime.host.stdin.read({ signal: inputController.signal })[Symbol.asyncIterator]();
  const signals = createSignalQueue(runtime.host.signals.subscribe.bind(runtime.host.signals));
  let inputNext = input.next();
  let signalNext = signals.next();
  let runtimeChangeNext = runtime.nextChange(changeController.signal);
  let inputBatchNext: Promise<readonly TuiInputResult<TState>[]> | undefined;
  try {
    for (;;) {
      const event = await Promise.race([
        inputNext.then((result) => ({ kind: 'input' as const, result })),
        signalNext.then((signal) => ({ kind: 'signal' as const, signal })),
        runtimeChangeNext.then((change) => ({ kind: 'runtime' as const, change })),
        ...(inputBatchNext === undefined
          ? []
          : [inputBatchNext.then((results) => ({ kind: 'inputBatch' as const, results }))])
      ]);
      if (event.kind === 'inputBatch') {
        inputBatchNext = undefined;
        const exit = event.results.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        continue;
      }
      if (event.kind === 'runtime') {
        if (event.change.kind === 'exit') return event.change.exit;
        runtimeChangeNext = runtime.nextChange(changeController.signal);
        continue;
      }
      if (event.kind === 'signal') {
        signalNext = signals.next();
        const pendingResults = await runtime.flushInput();
        inputBatchNext = undefined;
        const pendingExit = pendingResults.find((result) => result.exit !== undefined)?.exit;
        if (pendingExit !== undefined) return pendingExit;
        transcript?.record({ kind: 'input', event: { kind: 'signal', signal: event.signal } });
        const exit = await handleTuiSignal(runtime, event.signal);
        if (exit !== undefined) return exit;
        continue;
      }
      inputNext = input.next();
      if (event.result.done === true) {
        const results = await runtime.flushInput();
        const exit = results.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        break;
      }
      const batch = await runtime.handleInputChunk(event.result.value);
      inputBatchNext = batch.pending;
      const exit = batch.results.find((result) => result.exit !== undefined)?.exit;
      if (exit !== undefined) return exit;
    }
  } finally {
    inputController.abort();
    changeController.abort();
    signals.dispose();
    await input.return?.();
  }
  const explicitExit = runtime.exit();
  if (explicitExit !== undefined) return explicitExit;
  const state = runtime.getState();
  const frame = runtime.frame();
  if (state !== undefined && frame !== undefined) {
    return { ...completedExit(state, frame), diagnostics: runtime.diagnostics() };
  }
  return {
    status: 'error',
    diagnostics: [
      ...runtime.diagnostics(),
      diagnostic('TUI_RUN_FAILED', 'TUI input loop ended before the runtime produced a frame.', {
        target: runtime.app.id
      })
    ],
    snapshot: tuiSnapshot(runtime.app.id)
  };
}

async function handleTuiSignal<TState, TMessage>(
  runtime: TuiRuntime<TState, TMessage>,
  signal: TerminalSignal
): Promise<TuiExit<TState> | undefined> {
  if (signal === 'resize') {
    await runtime.resize(runtime.host.getViewport());
    return undefined;
  }
  const state = runtime.getState();
  const frame = runtime.frame();
  if (state === undefined || frame === undefined) {
    return {
      status: 'interrupted',
      diagnostics: [
        diagnostic('INPUT_INTERRUPTED', `Received ${signal} before the TUI runtime produced a frame.`, {
          target: runtime.app.id
        })
      ],
      snapshot: tuiSnapshot(runtime.app.id)
    };
  }
  return { ...exitWithStatus('interrupted', state, frame), diagnostics: runtime.diagnostics() };
}

interface SignalQueue {
  next(): Promise<TerminalSignal>;
  dispose(): void;
}

function createSignalQueue(subscribe: (listener: (signal: TerminalSignal) => void) => Unsubscribe): SignalQueue {
  const queued: TerminalSignal[] = [];
  const waiters: ((signal: TerminalSignal) => void)[] = [];
  const unsubscribe = subscribe((signal) => {
    const waiter = waiters.shift();
    if (waiter === undefined) {
      queued.push(signal);
      return;
    }
    waiter(signal);
  });
  return {
    next() {
      const queuedSignal = queued.shift();
      if (queuedSignal !== undefined) return Promise.resolve(queuedSignal);
      return new Promise((resolve) => waiters.push(resolve));
    },
    dispose() {
      unsubscribe();
      waiters.splice(0);
      queued.splice(0);
    }
  };
}
