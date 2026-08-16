import { diagnostic } from '../diagnostics.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { completedExit, exitWithStatus } from './exit.ts';
import { retireTuiRuntimeInput } from './runtime.ts';
import type {
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalSignal,
  Unsubscribe
} from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type {
  TuiExit,
  TuiInputBatchResult,
  TuiInputResult,
  TuiRuntime,
  TuiRuntimeChange
} from './types.ts';
import type {
  InputSuspensionRequest,
  TuiInputSuspensionController
} from './input-suspension.ts';

export async function runTuiInputLoop<TState, TMessage>(
  runtime: TuiRuntime<TState, TMessage>,
  host: TerminalHost,
  appId: string,
  transcript: TranscriptRecorder | undefined,
  retireInput: (retirement: Promise<void>) => void,
  suspension: TuiInputSuspensionController | undefined,
  signals: TuiSignalQueue
): Promise<TuiExit<TState>> {
  const changeController = new AbortController();
  let inputController = new AbortController();
  let input: AsyncIterator<TerminalInputChunk> | undefined;
  let inputNext: Promise<IteratorResult<TerminalInputChunk>> | undefined;
  let signalNext: Promise<TerminalSignal>;
  let runtimeChangeNext: Promise<TuiRuntimeChange<TState>>;
  let inputWorkNext: Promise<InputWorkOutcome<TState>> | undefined;
  let inputBatchNext: Promise<readonly TuiInputResult<TState>[]> | undefined;
  let resizeQueued = false;
  let resizeNext: Promise<Settled<unknown>> | undefined;
  let suspensionNext: Promise<InputSuspensionRequest> | undefined;
  let suspendedRequest: InputSuspensionRequest | undefined;
  try {
    input = host.stdin.read({ signal: inputController.signal })[Symbol.asyncIterator]();
    inputNext = input.next();
    signalNext = signals.next();
    runtimeChangeNext = runtime.nextChange(changeController.signal);
    suspensionNext = suspension?.next();
    for (;;) {
      const resumeRequest = suspendedRequest;
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
          : [resizeNext.then((outcome) => ({ kind: 'resize' as const, outcome }))]),
        ...(suspensionNext === undefined
          ? []
          : [suspensionNext.then((request) => ({ kind: 'suspend' as const, request }))]),
        ...(resumeRequest === undefined
          ? []
          : [resumeRequest.resumeRequested.then(() => ({
              kind: 'resume' as const,
              request: resumeRequest
            }))])
      ];
      const event = await Promise.race(candidates);
      if (event.kind === 'suspend') {
        suspensionNext = undefined;
        let inputReleaseStarted = false;
        try {
          const exit = await settleInputWork();
          if (exit !== undefined) return exit;
          const releaseInput = host.stdin.release?.bind(host.stdin);
          if (releaseInput === undefined) {
            throw new Error('Terminal host input cannot be released for an external operation.');
          }
          const suspendingInput = input;
          if (suspendingInput === undefined) {
            throw new Error('Terminal input is unavailable during suspension.');
          }
          inputReleaseStarted = true;
          inputController.abort('terminal_input_suspended');
          inputNext = undefined;
          await releaseTerminalInput(suspendingInput, releaseInput);
          input = undefined;
          runtime.resetInput();
          suspendedRequest = event.request;
          event.request.paused();
        } catch (cause) {
          event.request.pauseFailed(cause);
          if (inputReleaseStarted) throw cause;
          suspensionNext = suspension?.next();
        }
        continue;
      }
      if (event.kind === 'resume') {
        suspendedRequest = undefined;
        openInput();
        event.request.resumed();
        suspensionNext = suspension?.next();
        continue;
      }
      if (event.kind === 'input') {
        inputNext = undefined;
        if (event.outcome.status === 'rejected') throw event.outcome.cause;
        inputWorkNext = event.outcome.value.done === true
          ? settle(runtime.flushInput()).then((outcome) => ({ outcome, endAfter: true }))
          : settle(runtime.handleInputChunk(event.outcome.value.value))
              .then((outcome) => ({ outcome, endAfter: false }));
        continue;
      }
      if (event.kind === 'inputWork') {
        inputWorkNext = undefined;
        if (event.outcome.outcome.status === 'rejected') throw event.outcome.outcome.cause;
        const batch = normalizeInputWork(event.outcome.outcome.value);
        const exit = batch.results.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        inputBatchNext = batch.pending;
        if (event.outcome.endAfter) break;
        const activeInput = input;
        if (activeInput === undefined) {
          throw new Error('Terminal input is unavailable while processing input.');
        }
        inputNext = activeInput.next();
        continue;
      }
      if (event.kind === 'inputBatch') {
        inputBatchNext = undefined;
        if (event.outcome.status === 'rejected') throw event.outcome.cause;
        const exit = event.outcome.value.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        continue;
      }
      if (event.kind === 'resize') {
        resizeNext = undefined;
        if (event.outcome.status === 'rejected') throw event.outcome.cause;
        if (resizeQueued) {
          resizeQueued = false;
          resizeNext = settle(runtime.resize(host.getTerminalSize()));
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
        if (resizeNext === undefined) resizeNext = settle(runtime.resize(host.getTerminalSize()));
        else resizeQueued = true;
        continue;
      }
      inputController.abort(`terminal_signal:${event.signal}`);
      inputNext = undefined;
      retireTuiRuntimeInput(runtime);
      return handleTuiSignal(runtime, appId, event.signal);
    }
  } finally {
    inputController.abort();
    changeController.abort();
    const retirement = input === undefined
      ? Promise.resolve()
      : retireTerminalInput(input, host.stdin);
    suspendedRequest?.resumed();
    suspension?.close();
    retireInput(retirement);
  }
  const explicitExit = runtime.exit();
  if (explicitExit !== undefined) return explicitExit;
  const frame = runtime.frame();
  if (frame !== undefined) {
    return { ...completedExit(runtime.state(), frame), diagnostics: runtime.diagnostics() };
  }
  return {
    status: 'error',
    diagnostics: [
      ...runtime.diagnostics(),
      runtime.reportDiagnostic(diagnostic('TUI_RUN_FAILED', 'TUI input loop ended before the runtime produced a frame.', {
        target: appId
      }))
    ],
    snapshot: tuiSnapshot(appId)
  };

  function openInput(): void {
    inputController = new AbortController();
    const nextInput = host.stdin.read({ signal: inputController.signal })[Symbol.asyncIterator]();
    input = nextInput;
    inputNext = nextInput.next();
  }

  async function settleInputWork(): Promise<TuiExit<TState> | undefined> {
    if (inputWorkNext !== undefined) {
      const work = await inputWorkNext;
      inputWorkNext = undefined;
      if (work.outcome.status === 'rejected') throw work.outcome.cause;
      const batch = normalizeInputWork(work.outcome.value);
      const immediateExit = batch.results.find((result) => result.exit !== undefined)?.exit;
      if (immediateExit !== undefined) return immediateExit;
      inputBatchNext = batch.pending;
    }
    if (inputBatchNext !== undefined) {
      const batch = await inputBatchNext;
      inputBatchNext = undefined;
      const exit = batch.find((result) => result.exit !== undefined)?.exit;
      if (exit !== undefined) return exit;
    }
    return undefined;
  }
}

async function retireTerminalInput(
  reader: AsyncIterator<TerminalInputChunk>,
  input: TerminalInput
): Promise<void> {
  const results = await Promise.allSettled([
    Promise.resolve().then(async () => reader.return?.()),
    Promise.resolve().then(async () => input.release?.())
  ]);
  const failures: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') failures.push(result.reason);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'TUI input retirement failed.');
}

async function releaseTerminalInput(
  reader: AsyncIterator<TerminalInputChunk>,
  releaseInput: () => Promise<void>
): Promise<void> {
  const readerReturn = Promise.resolve().then(async () => reader.return?.());
  void readerReturn.catch(() => undefined);
  await Promise.resolve().then(releaseInput);
}

function handleTuiSignal<TState, TMessage>(
  runtime: TuiRuntime<TState, TMessage>,
  appId: string,
  signal: Exclude<TerminalSignal, 'resize'>
): TuiExit<TState> {
  const frame = runtime.frame();
  if (frame === undefined) {
    return {
      status: 'interrupted',
      diagnostics: [
        runtime.reportDiagnostic(diagnostic('INPUT_INTERRUPTED', `Received ${signal} before the TUI runtime produced a frame.`, {
          target: appId
        }))
      ],
      snapshot: tuiSnapshot(appId)
    };
  }
  return { ...exitWithStatus('interrupted', runtime.state(), frame), diagnostics: runtime.diagnostics() };
}

type Settled<TValue> =
  | { readonly status: 'fulfilled'; readonly value: TValue }
  | { readonly status: 'rejected'; readonly cause: unknown };

interface InputWorkOutcome<TState> {
  readonly outcome: Settled<TuiInputBatchResult<TState> | readonly TuiInputResult<TState>[]>;
  readonly endAfter: boolean;
}

type InputLoopEvent<TState> =
  | { readonly kind: 'input'; readonly outcome: Settled<IteratorResult<TerminalInputChunk>> }
  | { readonly kind: 'inputWork'; readonly outcome: InputWorkOutcome<TState> }
  | { readonly kind: 'inputBatch'; readonly outcome: Settled<readonly TuiInputResult<TState>[]> }
  | { readonly kind: 'resize'; readonly outcome: Settled<unknown> }
  | { readonly kind: 'runtime'; readonly change: TuiRuntimeChange<TState> }
  | { readonly kind: 'signal'; readonly signal: TerminalSignal }
  | { readonly kind: 'suspend'; readonly request: InputSuspensionRequest }
  | { readonly kind: 'resume'; readonly request: InputSuspensionRequest };

function settle<TValue>(operation: Promise<TValue>): Promise<Settled<TValue>> {
  return operation.then(
    (value) => ({ status: 'fulfilled', value }),
    (cause: unknown) => ({ status: 'rejected', cause })
  );
}

function normalizeInputWork<TState>(
  work: TuiInputBatchResult<TState> | readonly TuiInputResult<TState>[]
): TuiInputBatchResult<TState> {
  return 'results' in work ? work : { results: work };
}

export interface TuiSignalQueue {
  readonly interruption: AbortSignal;
  next(): Promise<TerminalSignal>;
  dispose(): void;
}

export function createTuiSignalQueue(
  subscribe: (listener: (signal: TerminalSignal) => void) => Unsubscribe
): TuiSignalQueue {
  const queued: TerminalSignal[] = [];
  const waiters: ((signal: TerminalSignal) => void)[] = [];
  const interruption = new AbortController();
  let resizeQueued = false;
  const unsubscribe = subscribe((signal) => {
    if (signal !== 'resize' && !interruption.signal.aborted) interruption.abort(signal);
    const waiter = waiters.shift();
    if (waiter === undefined) {
      if (signal === 'resize' && resizeQueued) return;
      queued.push(signal);
      if (signal === 'resize') resizeQueued = true;
      return;
    }
    waiter(signal);
  });
  return {
    interruption: interruption.signal,
    next() {
      const queuedSignal = queued.shift();
      if (queuedSignal !== undefined) {
        if (queuedSignal === 'resize') resizeQueued = false;
        return Promise.resolve(queuedSignal);
      }
      return new Promise((resolve) => waiters.push(resolve));
    },
    dispose() {
      unsubscribe();
      waiters.splice(0);
      queued.splice(0);
      resizeQueued = false;
    }
  };
}
