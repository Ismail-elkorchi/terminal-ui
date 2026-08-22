import { diagnostic } from '../diagnostics.ts';
import { errorFromUnknown } from '../errors.ts';
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
  const events = createInputLoopEventMultiplexer<TState>();
  let inputController = new AbortController();
  let input: AsyncIterator<TerminalInputChunk> | undefined;
  let inputWorkNext: Promise<InputWorkOutcome<TState>> | undefined;
  let inputBatchNext: Promise<readonly TuiInputResult<TState>[]> | undefined;
  let resizeQueued = false;
  let resizeNext: Promise<unknown> | undefined;
  let suspendedRequest: InputSuspensionRequest | undefined;
  try {
    input = host.stdin.read({ signal: inputController.signal })[Symbol.asyncIterator]();
    const firstInput = input.next();
    watchSignal();
    watchRuntimeChange();
    watchInput(firstInput);
    watchSuspension();
    for (;;) {
      const event = await events.next();
      if (event.kind === 'suspend') {
        let inputReleaseStarted = false;
        try {
          events.cancel('inputWork');
          events.cancel('inputBatch');
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
          events.cancel('input');
          inputController.abort('terminal_input_suspended');
          await releaseTerminalInput(suspendingInput, releaseInput);
          input = undefined;
          runtime.resetInput();
          suspendedRequest = event.request;
          event.request.paused();
          watchResume(event.request);
        } catch (cause) {
          event.request.pauseFailed(cause);
          if (inputReleaseStarted) throw cause;
          watchSuspension();
        }
        continue;
      }
      if (event.kind === 'resume') {
        suspendedRequest = undefined;
        openInput();
        event.request.resumed();
        watchSuspension();
        continue;
      }
      if (event.kind === 'input') {
        inputWorkNext = event.value.done === true
          ? runtime.flushInput().then((work) => ({ work, endAfter: true }))
          : runtime.handleInputChunk(event.value.value)
              .then((work) => ({ work, endAfter: false }));
        events.watch('inputWork', inputWorkNext, (outcome) => ({ kind: 'inputWork', outcome }));
        continue;
      }
      if (event.kind === 'inputWork') {
        inputWorkNext = undefined;
        const batch = normalizeInputWork(event.outcome.work);
        const exit = batch.results.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        inputBatchNext = batch.pending;
        if (event.outcome.endAfter) break;
        const activeInput = input;
        if (activeInput === undefined) {
          throw new Error('Terminal input is unavailable while processing input.');
        }
        watchInput(activeInput.next());
        if (inputBatchNext !== undefined) {
          events.watch('inputBatch', inputBatchNext, (results) => ({ kind: 'inputBatch', results }));
        }
        continue;
      }
      if (event.kind === 'inputBatch') {
        inputBatchNext = undefined;
        const exit = event.results.find((result) => result.exit !== undefined)?.exit;
        if (exit !== undefined) return exit;
        continue;
      }
      if (event.kind === 'resize') {
        resizeNext = undefined;
        if (resizeQueued) {
          resizeQueued = false;
          watchResize(runtime.resize(host.getTerminalSize()));
        }
        continue;
      }
      if (event.kind === 'runtime') {
        if (event.change.kind === 'exit') return event.change.exit;
        watchRuntimeChange();
        continue;
      }
      watchSignal();
      transcript?.record({ kind: 'input', event: { kind: 'signal', signal: event.signal } });
      if (event.signal === 'resize') {
        if (resizeNext === undefined) watchResize(runtime.resize(host.getTerminalSize()));
        else resizeQueued = true;
        continue;
      }
      inputController.abort(`terminal_signal:${event.signal}`);
      retireTuiRuntimeInput(runtime);
      return handleTuiSignal(runtime, appId, event.signal);
    }
  } finally {
    events.close();
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
    watchInput(nextInput.next());
  }

  function watchInput(operation: Promise<IteratorResult<TerminalInputChunk>>): void {
    events.watch('input', operation, (value) => ({ kind: 'input', value }));
  }

  function watchSignal(): void {
    events.watch('signal', signals.next(), (signal) => ({ kind: 'signal', signal }));
  }

  function watchRuntimeChange(): void {
    events.watch(
      'runtime',
      runtime.nextChange(changeController.signal),
      (change) => ({ kind: 'runtime', change })
    );
  }

  function watchSuspension(): void {
    if (suspension === undefined) return;
    events.watch('suspend', suspension.next(), (request) => ({ kind: 'suspend', request }));
  }

  function watchResume(request: InputSuspensionRequest): void {
    events.watch('resume', request.resumeRequested, () => ({ kind: 'resume', request }));
  }

  function watchResize(operation: Promise<unknown>): void {
    resizeNext = operation;
    events.watch('resize', operation, () => ({ kind: 'resize' }));
  }

  async function settleInputWork(): Promise<TuiExit<TState> | undefined> {
    if (inputWorkNext !== undefined) {
      const work = await inputWorkNext;
      inputWorkNext = undefined;
      const batch = normalizeInputWork(work.work);
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

interface InputWorkOutcome<TState> {
  readonly work: TuiInputBatchResult<TState> | readonly TuiInputResult<TState>[];
  readonly endAfter: boolean;
}

type InputLoopEvent<TState> =
  | { readonly kind: 'input'; readonly value: IteratorResult<TerminalInputChunk> }
  | { readonly kind: 'inputWork'; readonly outcome: InputWorkOutcome<TState> }
  | { readonly kind: 'inputBatch'; readonly results: readonly TuiInputResult<TState>[] }
  | { readonly kind: 'resize' }
  | { readonly kind: 'runtime'; readonly change: TuiRuntimeChange<TState> }
  | { readonly kind: 'signal'; readonly signal: TerminalSignal }
  | { readonly kind: 'suspend'; readonly request: InputSuspensionRequest }
  | { readonly kind: 'resume'; readonly request: InputSuspensionRequest };

type InputLoopEventKind = InputLoopEvent<unknown>['kind'];

const inputLoopEventPriority: readonly InputLoopEventKind[] = Object.freeze([
  'signal',
  'runtime',
  'input',
  'inputWork',
  'inputBatch',
  'resize',
  'suspend',
  'resume'
]);

type InputLoopEventOutcome<TState> =
  | { readonly status: 'fulfilled'; readonly event: InputLoopEvent<TState> }
  | { readonly status: 'rejected'; readonly cause: unknown };

function createInputLoopEventMultiplexer<TState>() {
  const watched = new Map<InputLoopEventKind, symbol>();
  const pending = new Map<InputLoopEventKind, InputLoopEventOutcome<TState>>();
  let waiter: PromiseWithResolvers<InputLoopEvent<TState>> | undefined;
  let closed = false;

  return {
    watch<TValue>(
      kind: InputLoopEventKind,
      operation: Promise<TValue>,
      project: (value: TValue) => InputLoopEvent<TState>
    ): void {
      if (closed) throw new Error('TUI input event multiplexer is closed.');
      if (watched.has(kind) || pending.has(kind)) {
        throw new Error(`TUI input event lane already has pending work: ${kind}.`);
      }
      const token = Symbol(kind);
      watched.set(kind, token);
      void operation.then(
        (value) => { publish(kind, token, { status: 'fulfilled', event: project(value) }); },
        (cause: unknown) => { publish(kind, token, { status: 'rejected', cause }); }
      );
    },
    cancel(kind: InputLoopEventKind): void {
      watched.delete(kind);
      pending.delete(kind);
    },
    next(): Promise<InputLoopEvent<TState>> {
      if (closed) return Promise.reject(new Error('TUI input event multiplexer is closed.'));
      const outcome = takePending();
      if (outcome !== undefined) return outcomePromise(outcome);
      if (waiter !== undefined) {
        return Promise.reject(new Error('TUI input event multiplexer already has a pending consumer.'));
      }
      waiter = Promise.withResolvers<InputLoopEvent<TState>>();
      return waiter.promise;
    },
    close(): void {
      if (closed) return;
      closed = true;
      watched.clear();
      pending.clear();
      const activeWaiter = waiter;
      waiter = undefined;
      activeWaiter?.reject(new Error('TUI input event multiplexer is closed.'));
    }
  };

  function publish(
    kind: InputLoopEventKind,
    token: symbol,
    outcome: InputLoopEventOutcome<TState>
  ): void {
    if (closed || watched.get(kind) !== token) return;
    watched.delete(kind);
    pending.set(kind, outcome);
    settleWaiter();
  }

  function settleWaiter(): void {
    const activeWaiter = waiter;
    if (activeWaiter === undefined) return;
    const outcome = takePending();
    if (outcome === undefined) return;
    waiter = undefined;
    if (outcome.status === 'fulfilled') activeWaiter.resolve(outcome.event);
    else activeWaiter.reject(errorFromUnknown(outcome.cause));
  }

  function takePending(): InputLoopEventOutcome<TState> | undefined {
    for (const kind of inputLoopEventPriority) {
      const outcome = pending.get(kind);
      if (outcome === undefined) continue;
      pending.delete(kind);
      return outcome;
    }
    return undefined;
  }
}

function outcomePromise<TState>(
  outcome: InputLoopEventOutcome<TState>
): Promise<InputLoopEvent<TState>> {
  return outcome.status === 'fulfilled'
    ? Promise.resolve(outcome.event)
    : Promise.reject(errorFromUnknown(outcome.cause));
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
  const waiters: PromiseWithResolvers<TerminalSignal>[] = [];
  const interruption = new AbortController();
  let resizeQueued = false;
  let closed: Error | undefined;
  const unsubscribe = subscribe((signal) => {
    if (closed !== undefined) return;
    if (signal !== 'resize' && !interruption.signal.aborted) interruption.abort(signal);
    const waiter = waiters.shift();
    if (waiter === undefined) {
      if (signal === 'resize' && resizeQueued) return;
      queued.push(signal);
      if (signal === 'resize') resizeQueued = true;
      return;
    }
    waiter.resolve(signal);
  });
  return {
    interruption: interruption.signal,
    next() {
      if (closed !== undefined) return Promise.reject(closed);
      const queuedSignal = queued.shift();
      if (queuedSignal !== undefined) {
        if (queuedSignal === 'resize') resizeQueued = false;
        return Promise.resolve(queuedSignal);
      }
      const waiter = Promise.withResolvers<TerminalSignal>();
      waiters.push(waiter);
      return waiter.promise;
    },
    dispose() {
      if (closed !== undefined) return;
      closed = new Error('TUI signal queue is disposed.');
      unsubscribe();
      for (const waiter of waiters.splice(0)) waiter.reject(closed);
      queued.splice(0);
      resizeQueued = false;
    }
  };
}
