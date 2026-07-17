import { diagnostic } from '../diagnostics.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { completedExit, exitWithStatus } from './exit.ts';
import type { TerminalInputChunk, TerminalSignal, Unsubscribe } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type {
  TuiExit,
  TuiInputBatchResult,
  TuiInputResult,
  TuiRuntime,
  TuiRuntimeChange
} from './types.ts';

export async function runTuiInputLoop<TState, TMessage>(
  runtime: TuiRuntime<TState, TMessage>,
  transcript?: TranscriptRecorder
): Promise<TuiExit<TState>> {
  const inputController = new AbortController();
  const changeController = new AbortController();
  const input = runtime.host.stdin.read({ signal: inputController.signal })[Symbol.asyncIterator]();
  const signals = createSignalQueue(runtime.host.signals.subscribe.bind(runtime.host.signals));
  let inputNext: Promise<IteratorResult<TerminalInputChunk>> | undefined = input.next();
  let signalNext = signals.next();
  let runtimeChangeNext = runtime.nextChange(changeController.signal);
  let inputWorkNext: Promise<InputWorkOutcome<TState>> | undefined;
  let inputBatchNext: Promise<readonly TuiInputResult<TState>[]> | undefined;
  let resizeNext: Promise<Settled<void>> | undefined;
  let resizeRequested = false;
  try {
    for (;;) {
      const candidates: Promise<InputLoopEvent<TState>>[] = [
        signalNext.then((signal) => ({ kind: 'signal' as const, signal })),
        runtimeChangeNext.then((change) => ({ kind: 'runtime' as const, change })),
        ...(inputNext === undefined
          ? []
          : [settle(inputNext).then((outcome) => ({ kind: 'input' as const, outcome }))]),
        ...(inputWorkNext === undefined
          ? []
          : [inputWorkNext.then((outcome) => ({ kind: 'inputWork' as const, outcome }))]),
        ...(inputBatchNext === undefined
          ? []
          : [settle(inputBatchNext).then((outcome) => ({ kind: 'inputBatch' as const, outcome }))]),
        ...(resizeNext === undefined
          ? []
          : [resizeNext.then((outcome) => ({ kind: 'resize' as const, outcome }))])
      ];
      const event = await Promise.race(candidates);
      if (event.kind === 'input') {
        inputNext = undefined;
        if (!event.outcome.ok) throw event.outcome.cause;
        inputWorkNext = event.outcome.value.done === true
          ? settle(runtime.flushInput()).then((outcome) => ({ outcome, endAfter: true }))
          : settle(runtime.handleInputChunk(event.outcome.value.value))
              .then((outcome) => ({ outcome, endAfter: false }));
        continue;
      }
      if (event.kind === 'inputWork') {
        inputWorkNext = undefined;
        if (!event.outcome.outcome.ok) throw event.outcome.outcome.cause;
        const batch = normalizeInputWork(event.outcome.outcome.value);
        const exit = batch.results.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        inputBatchNext = batch.pending;
        if (event.outcome.endAfter) break;
        inputNext = input.next();
        continue;
      }
      if (event.kind === 'inputBatch') {
        inputBatchNext = undefined;
        if (!event.outcome.ok) throw event.outcome.cause;
        const exit = event.outcome.value.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        continue;
      }
      if (event.kind === 'resize') {
        resizeNext = undefined;
        if (!event.outcome.ok) throw event.outcome.cause;
        if (resizeRequested) {
          resizeRequested = false;
          resizeNext = settleVoid(runtime.resize(runtime.host.getViewport()));
        }
        continue;
      }
      if (event.kind === 'runtime') {
        if (event.change.kind === 'exit') return event.change.exit;
        runtimeChangeNext = runtime.nextChange(changeController.signal);
        continue;
      }
      signalNext = signals.next();
      transcript?.record({ kind: 'input', event: { kind: 'signal', signal: event.signal } });
      if (event.signal === 'resize') {
        if (resizeNext === undefined) resizeNext = settleVoid(runtime.resize(runtime.host.getViewport()));
        else resizeRequested = true;
        continue;
      }
      return handleTuiSignal(runtime, event.signal);
    }
  } finally {
    inputController.abort();
    changeController.abort();
    signals.dispose();
    await input.return?.();
  }
  const explicitExit = runtime.exit();
  if (explicitExit !== undefined) return explicitExit;
  const state = runtime.state();
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

function handleTuiSignal<TState, TMessage>(
  runtime: TuiRuntime<TState, TMessage>,
  signal: Exclude<TerminalSignal, 'resize'>
): TuiExit<TState> {
  const state = runtime.state();
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

type Settled<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly cause: unknown };

interface InputWorkOutcome<TState> {
  readonly outcome: Settled<TuiInputBatchResult<TState> | readonly TuiInputResult<TState>[]>;
  readonly endAfter: boolean;
}

type InputLoopEvent<TState> =
  | { readonly kind: 'input'; readonly outcome: Settled<IteratorResult<TerminalInputChunk>> }
  | { readonly kind: 'inputWork'; readonly outcome: InputWorkOutcome<TState> }
  | { readonly kind: 'inputBatch'; readonly outcome: Settled<readonly TuiInputResult<TState>[]> }
  | { readonly kind: 'resize'; readonly outcome: Settled<void> }
  | { readonly kind: 'runtime'; readonly change: TuiRuntimeChange<TState> }
  | { readonly kind: 'signal'; readonly signal: TerminalSignal };

function settle<TValue>(operation: Promise<TValue>): Promise<Settled<TValue>> {
  return operation.then(
    (value) => ({ ok: true, value }),
    (cause: unknown) => ({ ok: false, cause })
  );
}

function settleVoid(operation: Promise<unknown>): Promise<Settled<void>> {
  return operation.then(
    () => ({ ok: true, value: undefined }),
    (cause: unknown) => ({ ok: false, cause })
  );
}

function normalizeInputWork<TState>(
  work: TuiInputBatchResult<TState> | readonly TuiInputResult<TState>[]
): TuiInputBatchResult<TState> {
  return 'results' in work ? work : { results: work };
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
