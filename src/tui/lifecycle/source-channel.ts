import { TerminalUiError } from '../../errors.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { TerminalClock } from '../../host/types.ts';
import type { TuiSourceChannelMetrics, TuiSourceEmission } from '../types.ts';

/** @beta */
export const defaultTuiSourceChannelCapacity = 64;

/** @beta */
export function reliableSourceMessage<TMessage extends NonNullable<unknown>>(message: TMessage): TuiSourceEmission<TMessage>;
export function reliableSourceMessage<TMessage>(message: unknown): TuiSourceEmission<TMessage> {
  if (message === null || message === undefined) {
    throw new TypeError('Reliable source message cannot be null or undefined.');
  }
  return Object.freeze({ kind: 'reliable', message: message as TMessage });
}

/** @beta */
export function replaceableSourceMessage<TMessage extends NonNullable<unknown>>(
  key: string,
  message: TMessage,
): TuiSourceEmission<TMessage>;
export function replaceableSourceMessage<TMessage>(
  key: string,
  message: unknown,
): TuiSourceEmission<TMessage> {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new TypeError('Replaceable source message key must be a non-empty string.');
  }
  if (message === null || message === undefined) {
    throw new TypeError('Replaceable source message cannot be null or undefined.');
  }
  return Object.freeze({ kind: 'replaceable', key, message: message as TMessage });
}

export function decodeTuiSourceEmission<TMessage>(
  value: unknown,
  label = 'TUI source emission',
): TuiSourceEmission<TMessage> {
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  if (!Object.hasOwn(value, 'message') || value['message'] === null || value['message'] === undefined) {
    throw new TypeError(`${label} message cannot be null or undefined.`);
  }
  if (value['kind'] === 'reliable') {
    return Object.freeze({ kind: 'reliable', message: value['message'] as TMessage });
  }
  if (value['kind'] === 'replaceable') {
    const key = value['key'];
    if (typeof key !== 'string' || key.trim() === '') {
      throw new TypeError(`${label} replaceable key must be a non-empty string.`);
    }
    return Object.freeze({ kind: 'replaceable', key, message: value['message'] as TMessage });
  }
  throw new TypeError(`${label} kind is invalid.`);
}

export interface TuiSourceChannel<TMessage> {
  admit(emission: TuiSourceEmission<TMessage>): Promise<void>;
  close(): Promise<void>;
  cancel(): void;
  /** Wait for terminal channel work to physically settle, including cancelled dispatches. */
  settle(): Promise<void>;
  metrics(): TuiSourceChannelMetrics;
}

interface ReplaceableEmission<TMessage> {
  readonly kind: 'replaceable';
  readonly key: string;
  message: TMessage;
}

type BufferedEmission<TMessage> =
  | { readonly kind: 'reliable'; readonly message: TMessage }
  | ReplaceableEmission<TMessage>;

interface PendingAdmission<TMessage> {
  readonly emission: TuiSourceEmission<TMessage>;
  readonly resolve: () => void;
  readonly reject: (cause: unknown) => void;
}

export function createTuiSourceChannel<TMessage>(options: {
  readonly capacity?: number;
  readonly maxBatchMessages?: number;
  readonly cadence?: { readonly intervalMs: number; readonly clock: TerminalClock };
  readonly dispatchMany: (messages: readonly TMessage[]) => Promise<void>;
}): TuiSourceChannel<TMessage> {
  const capacity = options.capacity ?? defaultTuiSourceChannelCapacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('TUI source channel capacity must be a positive safe integer.');
  }
  if (options.maxBatchMessages !== undefined && (!Number.isSafeInteger(options.maxBatchMessages) || options.maxBatchMessages < 1)) {
    throw new RangeError('TUI source batch limit must be a positive safe integer.');
  }
  const queue: BufferedEmission<TMessage>[] = [];
  // Only nodes in the latest contiguous replaceable segment can be replaced.
  const replaceableValues = new Map<string, ReplaceableEmission<TMessage>>();
  const cadenced: ReplaceableEmission<TMessage>[] = [];
  let pendingAdmission: PendingAdmission<TMessage> | undefined;
  let inFlight = 0;
  let drain: Promise<void> | undefined;
  let cadence: Promise<void> | undefined;
  let cadenceController: AbortController | undefined;
  let closePromise: Promise<void> | undefined;
  let closeWaiter: { readonly resolve: () => void; readonly reject: (cause: unknown) => void } | undefined;
  let settlement: Promise<void> | undefined;
  let settleWaiter: (() => void) | undefined;
  let state: SourceChannelState = { kind: 'open' };
  const closedError = new TerminalUiError('TUI source channel is closed.');
  const counters = {
    reliableAdmissions: 0,
    replaceableAdmissions: 0,
    replacements: 0,
    dispatchedMessages: 0,
    dispatchedBatches: 0,
    maximumBuffered: 0,
    cadenceFlushes: 0,
  };

  return {
    async admit(emission) {
      assertAdmissionOpen();
      if (emission.kind === 'replaceable') {
        const previous = replaceableValues.get(emission.key);
        if (previous !== undefined) {
          previous.message = emission.message;
          counters.replaceableAdmissions += 1;
          counters.replacements += 1;
          return;
        }
      }
      if (pendingAdmission !== undefined) {
        throw new TerminalUiError('TUI source channel already has a blocked emission; await sink.emit() before emitting again.', {
          code: 'TUI_OVERLOAD', reason: 'source_blocked_emission', limit: 1, observed: 2,
        });
      }
      if (emission.kind === 'reliable') sealReplaceableSegment();
      if (bufferedCount() >= capacity) {
        await new Promise<void>((resolve, reject) => {
          pendingAdmission = { emission, resolve, reject };
        });
        return;
      }
      enqueue(emission);
    },
    close() {
      if (closePromise !== undefined) return closePromise;
      closePromise = new Promise<void>((resolve, reject) => {
        closeWaiter = { resolve, reject };
      });
      if (state.kind === 'open') {
        state = { kind: 'closing' };
        releaseCapacity();
        flushCadenced();
      }
      settleClose();
      return closePromise;
    },
    cancel() {
      if (isTerminal()) return;
      terminate({ kind: 'cancelled', error: new TerminalUiError('TUI source channel was cancelled.') });
    },
    settle() {
      settlement ??= new Promise<void>((resolve) => { settleWaiter = resolve; });
      settleClose();
      return settlement;
    },
    metrics() {
      return Object.freeze({ ...counters });
    },
  };

  function enqueue(emission: TuiSourceEmission<TMessage>): void {
    if (emission.kind === 'reliable') {
      counters.reliableAdmissions += 1;
      queue.push(emission);
    } else {
      counters.replaceableAdmissions += 1;
      const buffered: ReplaceableEmission<TMessage> = { ...emission };
      replaceableValues.set(emission.key, buffered);
      if (options.cadence === undefined) queue.push(buffered);
      else {
        cadenced.push(buffered);
        ensureCadence();
      }
    }
    counters.maximumBuffered = Math.max(counters.maximumBuffered, bufferedCount());
    ensureDrain();
  }

  function sealReplaceableSegment(): void {
    replaceableValues.clear();
    flushCadenced();
  }

  function ensureDrain(): void {
    if (drain !== undefined || !canDrain() || queue.length === 0) return;
    // Schedule after installing the owner so synchronous dispatch callbacks cannot
    // start a second drain or release capacity belonging to the first one.
    drain = Promise.resolve().then(drainQueued)
      .catch((cause: unknown) => {
        fail(cause);
      })
      .finally(() => {
        drain = undefined;
        releaseCapacity();
        if (canDrain() && queue.length > 0) ensureDrain();
        else settleClose();
      });
  }

  function assertAdmissionOpen(): void {
    if (state.kind === 'failed' || state.kind === 'cancelled') throw state.error;
    if (state.kind !== 'open') throw closedError;
  }

  function ensureCadence(): void {
    if (options.cadence === undefined || cadence !== undefined || cadenced.length === 0 || state.kind !== 'open') return;
    const controller = new AbortController();
    cadenceController = controller;
    cadence = options.cadence.clock.sleep(options.cadence.intervalMs, controller.signal)
      .then((outcome) => {
        if (outcome === 'elapsed' && state.kind === 'open') flushCadenced();
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) fail(cause);
      })
      .finally(() => {
        if (cadenceController === controller) cadenceController = undefined;
        cadence = undefined;
        if (state.kind === 'open' && cadenced.length > 0) ensureCadence();
        else settleClose();
      });
  }

  function flushCadenced(): void {
    if (!canDrain() || cadenced.length === 0) return;
    cadenceController?.abort();
    for (const item of cadenced) queue.push(item);
    cadenced.length = 0;
    counters.cadenceFlushes += 1;
    ensureDrain();
  }

  async function drainQueued(): Promise<void> {
    while (canDrain() && queue.length > 0) {
      // Reliable emissions commit separately; replaceable batches cannot span one.
      const boundary = queue.findIndex((item) => item.kind === 'reliable');
      const count = Math.min(options.maxBatchMessages ?? capacity, boundary === 0 ? 1 : boundary === -1 ? queue.length : boundary);
      const buffered = queue.splice(0, count);
      const messages = buffered.map((item) => {
        if (item.kind === 'replaceable' && replaceableValues.get(item.key) === item) {
          replaceableValues.delete(item.key);
        }
        return item.message;
      });
      inFlight = messages.length;
      try {
        await options.dispatchMany(Object.freeze(messages));
        counters.dispatchedMessages += messages.length;
        counters.dispatchedBatches += 1;
      } finally {
        inFlight = 0;
      }
      releaseCapacity();
    }
  }

  function releaseCapacity(): void {
    const pending = pendingAdmission;
    if (pending === undefined) return;
    if (state.kind !== 'open') {
      pendingAdmission = undefined;
      pending.reject(state.kind === 'failed' || state.kind === 'cancelled' ? state.error : closedError);
    } else if (bufferedCount() < capacity) {
      pendingAdmission = undefined;
      enqueue(pending.emission);
      pending.resolve();
    }
  }

  function bufferedCount(): number {
    return queue.length + cadenced.length + inFlight;
  }

  function settleClose(): void {
    if (state.kind === 'closing' && bufferedCount() === 0 && drain === undefined) {
      state = { kind: 'closed' };
    }
    if (state.kind !== 'closed' && state.kind !== 'failed' && state.kind !== 'cancelled') return;
    const waiter = closeWaiter;
    closeWaiter = undefined;
    if (state.kind === 'closed') waiter?.resolve();
    else waiter?.reject(state.error);
    // Admission and close reject promptly on cancellation; ownership must wait
    // for the already-started dispatch and an abort-ignoring clock to finish.
    if (drain === undefined && cadence === undefined) {
      settleWaiter?.();
      settleWaiter = undefined;
    }
  }

  function canDrain(): boolean {
    return state.kind === 'open' || state.kind === 'closing';
  }

  function isTerminal(): boolean {
    return state.kind === 'closed' || state.kind === 'failed' || state.kind === 'cancelled';
  }

  function fail(cause: unknown): void {
    if (isTerminal()) return;
    terminate({ kind: 'failed', error: sourceChannelFailure(cause) });
  }

  function terminate(next: Extract<SourceChannelState, { readonly kind: 'failed' | 'cancelled' }>): void {
    state = next;
    cadenceController?.abort();
    queue.length = 0;
    replaceableValues.clear();
    cadenced.length = 0;
    releaseCapacity();
    settleClose();
  }
}

type SourceChannelState =
  | { readonly kind: 'open' }
  | { readonly kind: 'closing' }
  | { readonly kind: 'closed' }
  | { readonly kind: 'failed'; readonly error: Error }
  | { readonly kind: 'cancelled'; readonly error: Error };

function sourceChannelFailure(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('TUI source channel dispatch failed.', { cause });
}
