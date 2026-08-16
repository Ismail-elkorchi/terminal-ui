import { isNonArrayObject } from '../foundation/validation.ts';
import type { TuiSourceChannelMetrics, TuiSourceEmission } from './types.ts';
import type { TerminalClock } from '../host/index.ts';

export const defaultTuiSourceChannelCapacity = 64;

export function reliableSourceMessage<TMessage extends NonNullable<unknown>>(message: TMessage): TuiSourceEmission<TMessage>;
export function reliableSourceMessage<TMessage>(message: unknown): TuiSourceEmission<TMessage> {
  if (message === null || message === undefined) {
    throw new TypeError('Reliable source message cannot be null or undefined.');
  }
  return Object.freeze({ kind: 'reliable', message: message as TMessage });
}

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
  metrics(): TuiSourceChannelMetrics;
}

type BufferedEmission<TMessage> =
  | { readonly kind: 'reliable'; readonly message: TMessage }
  | { readonly kind: 'replaceable'; readonly key: string };

export function createTuiSourceChannel<TMessage>(options: {
  readonly capacity?: number;
  readonly cadence?: { readonly intervalMs: number; readonly clock: TerminalClock };
  readonly dispatchMany: (messages: readonly TMessage[]) => Promise<void>;
}): TuiSourceChannel<TMessage> {
  const capacity = options.capacity ?? defaultTuiSourceChannelCapacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('TUI source channel capacity must be a positive safe integer.');
  }
  const queue: BufferedEmission<TMessage>[] = [];
  const replaceableValues = new Map<string, TMessage>();
  const cadencedKeys: string[] = [];
  const cadencedValues = new Map<string, TMessage>();
  const capacityWaiters: (() => void)[] = [];
  const closeWaiters: { readonly resolve: () => void; readonly reject: (cause: unknown) => void }[] = [];
  let drain: Promise<void> | undefined;
  let cadence: Promise<void> | undefined;
  let cadenceController: AbortController | undefined;
  let state: SourceChannelState = { kind: 'open' };
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
      if (emission.kind === 'replaceable' && (
        replaceableValues.has(emission.key) || cadencedValues.has(emission.key)
      )) {
        if (cadencedValues.has(emission.key)) cadencedValues.set(emission.key, emission.message);
        else replaceableValues.set(emission.key, emission.message);
        counters.replaceableAdmissions += 1;
        counters.replacements += 1;
        return;
      }
      while (bufferedCount() >= capacity) {
        await new Promise<void>((resolve) => capacityWaiters.push(resolve));
        assertAdmissionOpen();
      }
      if (emission.kind === 'reliable') {
        counters.reliableAdmissions += 1;
        queue.push({ kind: 'reliable', message: emission.message });
      } else {
        counters.replaceableAdmissions += 1;
        if (options.cadence === undefined) {
          replaceableValues.set(emission.key, emission.message);
          queue.push({ kind: 'replaceable', key: emission.key });
        } else {
          cadencedValues.set(emission.key, emission.message);
          cadencedKeys.push(emission.key);
          ensureCadence();
        }
      }
      counters.maximumBuffered = Math.max(counters.maximumBuffered, bufferedCount());
      ensureDrain();
    },
    close() {
      if (state.kind === 'closed') return Promise.resolve();
      if (state.kind === 'failed' || state.kind === 'cancelled') {
        return Promise.reject(state.error);
      }
      state = { kind: 'closing' };
      flushCadenced();
      settleClose();
      if (closed()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => closeWaiters.push({ resolve, reject }));
    },
    cancel() {
      if (isTerminal()) return;
      terminate({ kind: 'cancelled', error: new Error('TUI source channel was cancelled.') });
    },
    metrics() {
      return Object.freeze({ ...counters });
    },
  };

  function ensureDrain(): void {
    if (drain !== undefined || !canDrain() || queue.length === 0) return;
    drain = drainQueued()
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
    if (state.kind !== 'open') throw new Error('TUI source channel is closed.');
  }

  function ensureCadence(): void {
    if (options.cadence === undefined || cadence !== undefined || cadencedKeys.length === 0 || state.kind !== 'open') return;
    const controller = new AbortController();
    cadenceController = controller;
    cadence = options.cadence.clock.sleep(options.cadence.intervalMs, controller.signal)
      .then(() => {
        if (state.kind === 'open') flushCadenced();
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) fail(cause);
      })
      .finally(() => {
        if (cadenceController === controller) cadenceController = undefined;
        cadence = undefined;
        if (state.kind === 'open' && cadencedKeys.length > 0) ensureCadence();
        else settleClose();
      });
  }

  function flushCadenced(): void {
    if (!canDrain() || cadencedKeys.length === 0) return;
    cadenceController?.abort();
    for (const key of cadencedKeys.splice(0)) {
      const message = cadencedValues.get(key);
      cadencedValues.delete(key);
      if (message === undefined) continue;
      replaceableValues.set(key, message);
      queue.push({ kind: 'replaceable', key });
    }
    counters.cadenceFlushes += 1;
    ensureDrain();
  }

  async function drainQueued(): Promise<void> {
    while (canDrain() && queue.length > 0) {
      const buffered = queue.splice(0, queue.length);
      const messages = buffered.flatMap((item): readonly TMessage[] => {
        if (item.kind === 'reliable') return [item.message];
        const message = replaceableValues.get(item.key);
        replaceableValues.delete(item.key);
        return message === undefined ? [] : [message];
      });
      releaseCapacity();
      if (messages.length === 0) continue;
      await options.dispatchMany(Object.freeze(messages));
      counters.dispatchedMessages += messages.length;
      counters.dispatchedBatches += 1;
    }
  }

  function releaseCapacity(): void {
    for (const resolve of capacityWaiters.splice(0)) resolve();
  }

  function bufferedCount(): number {
    return queue.length + cadencedKeys.length;
  }

  function settleClose(): void {
    if (state.kind === 'closing' && queue.length === 0 && cadencedKeys.length === 0 && drain === undefined) {
      state = { kind: 'closed' };
    }
    if (state.kind !== 'closed' && state.kind !== 'failed' && state.kind !== 'cancelled') return;
    for (const waiter of closeWaiters.splice(0)) {
      if (state.kind === 'closed') waiter.resolve();
      else waiter.reject(state.error);
    }
  }

  function canDrain(): boolean {
    return state.kind === 'open' || state.kind === 'closing';
  }

  function isTerminal(): boolean {
    return state.kind === 'closed' || state.kind === 'failed' || state.kind === 'cancelled';
  }

  function closed(): boolean {
    return state.kind === 'closed';
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
    cadencedKeys.length = 0;
    cadencedValues.clear();
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
