import type {
  TerminalClock,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions
} from './types.ts';
import { settleResourceDisposal } from './dispose.ts';
import {
  csiBody,
  findTerminalResponse,
  incompleteTerminalResponseStart
} from './terminal-response.ts';
import type { TerminalResponseClassification, TerminalResponseProtocol } from './terminal-response.ts';

const MAX_KITTY_FLAG_DIGITS = String(Number.MAX_SAFE_INTEGER).length;
const MAX_PROBE_BYTES = 64 * 1024;
const LATE_PROBE_AMBIGUITY_MS = 25;

export interface KittyKeyboardProbeResult {
  readonly status: 'supported' | 'unsupported' | 'inconclusive';
  readonly flags?: number;
}

export type TerminalResponseTransactionResult<TValue> =
  | { readonly status: 'matched'; readonly value: TValue }
  | { readonly status: 'unsupported' }
  | { readonly status: 'inconclusive' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly cause: unknown };

export interface TerminalResponseTransaction<TValue> {
  readonly signal: AbortSignal;
  readonly clock: TerminalClock;
  readonly protocol: TerminalResponseProtocol<TValue>;
  readonly send: () => Promise<void>;
}

export class TerminalInputAuthority implements TerminalInput {
  readonly #source: TerminalInput;
  readonly #disposeSource: (() => void | Promise<void>) | undefined;
  #sourceController = new AbortController();
  readonly #replay: TerminalInputChunk[] = [];
  #iterator: AsyncIterator<TerminalInputChunk> | undefined;
  #pending: Promise<IteratorResult<TerminalInputChunk>> | undefined;
  #lateResponseFilter: LateTerminalResponseFilter | undefined;
  #queryQueue: Promise<void> | undefined;
  #release: Promise<void> | undefined;
  #disposal: Promise<void> | undefined;
  #activeReader: object | undefined;
  #disposed = false;

  constructor(source: TerminalInput, disposeSource?: () => void | Promise<void>) {
    this.#source = source;
    this.#disposeSource = disposeSource;
  }

  read(options: TerminalInputReadOptions = {}): AsyncIterable<TerminalInputChunk> {
    return {
      [Symbol.asyncIterator]: () => this.#createReader(options.signal)
    };
  }

  async probeKittyKeyboard(
    signal: AbortSignal,
    clock: TerminalClock,
    send: () => Promise<void> = () => Promise.resolve()
  ): Promise<KittyKeyboardProbeResult> {
    const result = await this.queryTerminal({
      signal,
      clock,
      protocol: kittyKeyboardResponseProtocol,
      send
    });
    if (result.status === 'matched') return { status: 'supported', flags: result.value };
    if (result.status === 'unsupported') return { status: 'unsupported' };
    return { status: 'inconclusive' };
  }

  queryTerminal<TValue>(
    transaction: TerminalResponseTransaction<TValue>
  ): Promise<TerminalResponseTransactionResult<TValue>> {
    const run = (): Promise<TerminalResponseTransactionResult<TValue>> =>
      this.#runTerminalQuery(transaction);
    const operation = this.#queryQueue === undefined
      ? run()
      : this.#queryQueue.then(run, run);
    const settled = operation.then(() => undefined, () => undefined);
    this.#queryQueue = settled;
    void settled.then(() => {
      if (this.#queryQueue === settled) this.#queryQueue = undefined;
    });
    return operation;
  }

  async #runTerminalQuery<TValue>(
    transaction: TerminalResponseTransaction<TValue>
  ): Promise<TerminalResponseTransactionResult<TValue>> {
    if (transaction.signal.aborted) return { status: 'cancelled' };
    const owner = this.#acquireReader();
    const buffered = new Uint8Array(MAX_PROBE_BYTES);
    let byteCount = 0;
    let searchStart = 0;
    let overflow: Uint8Array | undefined;
    const cleanupState = { bufferedInputHandled: false };
    const consumed: ByteRange[] = [];
    try {
      const sending = transaction.send();
      let nextRead = this.#next(transaction.signal, owner);
      await sending;
      while (!signalAborted(transaction.signal) && byteCount < MAX_PROBE_BYTES) {
        const result = await nextRead;
        if (result.done) break;
        const bytes = bytesFromChunk(result.value);
        const retainedLength = Math.min(bytes.byteLength, MAX_PROBE_BYTES - byteCount);
        buffered.set(bytes.subarray(0, retainedLength), byteCount);
        byteCount += retainedLength;
        const retained = buffered.subarray(0, byteCount);
        for (;;) {
          const search = findTerminalResponse(retained, searchStart, transaction.protocol);
          if (search.kind === 'consume') {
            consumed.push({ start: search.start, end: search.end });
            searchStart = search.nextStart;
            continue;
          }
          if (search.kind === 'matched' || search.kind === 'fence') {
            consumed.push({ start: search.start, end: search.end });
            for (const part of bytePartsExcluding(retained, consumed)) this.#replayBytes(part);
            this.#replayBytes(bytes.subarray(retainedLength));
            cleanupState.bufferedInputHandled = true;
            return search.kind === 'matched'
              ? { status: 'matched', value: search.value }
              : { status: 'unsupported' };
          }
          searchStart = search.nextStart;
          break;
        }
        if (retainedLength < bytes.byteLength) overflow = bytes.subarray(retainedLength).slice();
        nextRead = this.#next(transaction.signal, owner);
      }
      if (signalAborted(transaction.signal)) return { status: 'cancelled' };
      this.#replayBytes(bytesExcluding(buffered.subarray(0, byteCount), consumed));
      if (overflow !== undefined) this.#replayBytes(overflow);
      cleanupState.bufferedInputHandled = true;
      return { status: 'inconclusive' };
    } catch (cause) {
      if (signalAborted(transaction.signal)) return { status: 'cancelled' };
      return { status: 'failed', cause };
    } finally {
      if (!cleanupState.bufferedInputHandled) {
        if (signalAborted(transaction.signal)) {
          this.#startLateProbeFilter(transaction.clock, transaction.protocol);
          this.#replayFilteredProbeBytes(bytesExcluding(buffered.subarray(0, byteCount), consumed));
          if (overflow !== undefined) this.#replayFilteredProbeBytes(overflow);
        } else {
          this.#replayBytes(bytesExcluding(buffered.subarray(0, byteCount), consumed));
          if (overflow !== undefined) this.#replayBytes(overflow);
        }
      }
      this.#releaseReader(owner);
    }
  }

  dispose(): Promise<void> {
    if (this.#disposal !== undefined) return this.#disposal;
    this.#disposed = true;
    const retirement = this.#startRelease('terminal_input_disposed');
    const sourceDisposal = Promise.resolve().then(async () => this.#disposeSource?.());
    void sourceDisposal.catch(() => undefined);
    this.#disposal = settleResourceDisposal([
      async () => retirement,
      async () => sourceDisposal
    ]).finally(() => {
      this.#activeReader = undefined;
      this.#replay.length = 0;
      this.#finishLateProbeFilter(false);
    });
    return this.#disposal;
  }

  release(): Promise<void> {
    if (this.#disposed) return this.#disposal ?? Promise.resolve();
    return this.#startRelease('terminal_input_released');
  }

  setRawMode(enabled: boolean): Promise<void> | void {
    return this.#source.setRawMode?.(enabled);
  }

  isRawModeEnabled(): boolean {
    return this.#source.isRawModeEnabled?.() ?? false;
  }

  isTty(): boolean {
    return this.#source.isTty();
  }

  #createReader(signal: AbortSignal | undefined): AsyncIterator<TerminalInputChunk> {
    if (this.#disposed) {
      return {
        next: () => Promise.resolve({ done: true, value: undefined }),
        return: () => Promise.resolve({ done: true, value: undefined })
      };
    }
    const owner = this.#acquireReader();
    let closed = false;
    const close = (): Promise<IteratorResult<TerminalInputChunk>> => {
      if (!closed) {
        closed = true;
        this.#releaseReader(owner);
      }
      return Promise.resolve({ done: true, value: undefined });
    };
    return {
      next: async () => {
        if (closed || this.#activeReader !== owner) return { done: true, value: undefined };
        const result = await this.#next(signal, owner);
        if (result.done) await close();
        return result;
      },
      return: close
    };
  }

  #acquireReader(): object {
    if (this.#disposed) throw new Error('Terminal input is disposed.');
    if (this.#release !== undefined) throw new Error('Terminal input is being released.');
    if (this.#activeReader !== undefined) throw new Error('Terminal input already has an active reader.');
    const owner = {};
    this.#activeReader = owner;
    return owner;
  }

  #releaseReader(owner: object): void {
    if (this.#activeReader === owner) this.#activeReader = undefined;
  }

  #startRelease(reason: string): Promise<void> {
    if (this.#release !== undefined) return this.#release;
    const sourceController = this.#sourceController;
    const iterator = this.#iterator;
    const pending = this.#pending;
    sourceController.abort(reason);
    let strandedChunk: TerminalInputChunk | undefined;
    const pendingCompletion = Promise.resolve(pending).then((result) => {
      if (result?.done === false) strandedChunk = this.#filterProbeChunk(result.value);
    });
    const iteratorClose = Promise.resolve()
      .then(async () => iterator?.return?.())
      .then(() => undefined);
    const sourceRelease = Promise.resolve()
      .then(async () => this.#source.release?.())
      .then(() => undefined);
    void iteratorClose.catch(() => undefined);
    void sourceRelease.catch(() => undefined);
    const release = settleResourceDisposal([
      async () => pendingCompletion,
      async () => iteratorClose,
      async () => sourceRelease
    ]).then(() => {
      if (this.#iterator === iterator) this.#iterator = undefined;
      if (this.#pending === pending) this.#pending = undefined;
      this.#activeReader = undefined;
      if (!this.#disposed && this.#sourceController === sourceController) {
        this.#sourceController = new AbortController();
        if (strandedChunk !== undefined) this.#replay.push(strandedChunk);
        this.#finishLateProbeFilter(true);
      } else {
        this.#finishLateProbeFilter(false);
      }
      if (this.#release === release) this.#release = undefined;
    });
    this.#release = release;
    void release.catch(() => undefined);
    return release;
  }

  async #next(
    signal: AbortSignal | undefined,
    owner: object
  ): Promise<IteratorResult<TerminalInputChunk>> {
    for (;;) {
      if (this.#activeReader !== owner) return { done: true, value: undefined };
      const replay = this.#replay.shift();
      if (replay !== undefined) return { done: false, value: replay };
      if (signal?.aborted === true) return { done: true, value: undefined };
      const sourceSignal = this.#sourceController.signal;
      this.#iterator ??= this.#source.read({ signal: sourceSignal })[Symbol.asyncIterator]();
      this.#pending ??= this.#iterator.next();
      const pending = this.#pending;
      const outcome = await waitForReaderOrProbeFilter(
        pending,
        this.#lateResponseFilter?.wake.promise,
        signal,
        sourceSignal
      );
      if (outcome.kind === 'filter') continue;
      const result = outcome.result;
      if (result === undefined) return { done: true, value: undefined };
      if (this.#activeReader !== owner) return { done: true, value: undefined };
      if (this.#pending === pending) this.#pending = undefined;
      if (result.done === true) {
        this.#finishLateProbeFilter(true);
        const trailing = this.#replay.shift();
        return trailing === undefined ? result : { done: false, value: trailing };
      }
      const filtered = this.#filterProbeChunk(result.value);
      if (filtered !== undefined) return { done: false, value: filtered };
    }
  }

  #replayBytes(bytes: Uint8Array): void {
    if (bytes.byteLength > 0) this.#replay.push({ data: bytes.slice() });
  }

  #replayFilteredProbeBytes(bytes: Uint8Array): void {
    this.#replayBytes(this.#filterProbeBytes(bytes));
  }

  #filterProbeChunk(chunk: TerminalInputChunk): TerminalInputChunk | undefined {
    if (this.#lateResponseFilter === undefined) return cloneInputChunk(chunk);
    const filtered = this.#filterProbeBytes(bytesFromChunk(chunk));
    return filtered.byteLength === 0 ? undefined : { data: filtered };
  }

  #filterProbeBytes(bytes: Uint8Array): Uint8Array {
    const filter = this.#lateResponseFilter;
    if (filter === undefined) return bytes.slice();
    const remaining = Math.max(0, MAX_PROBE_BYTES - filter.inspected);
    const retainedLength = Math.min(bytes.byteLength, remaining);
    let candidate = concatenateBytes(filter.held, bytes.subarray(0, retainedLength));
    const overflow = bytes.subarray(retainedLength);
    filter.inspected += retainedLength;
    for (;;) {
      const match = findTerminalResponse(candidate, 0, filter.protocol);
      if (match.kind === 'consume') {
        candidate = bytesExcluding(candidate, [{ start: match.start, end: match.end }]);
        continue;
      }
      if (match.kind === 'matched' || match.kind === 'fence') {
        const output = concatenateBytes(
          bytesExcluding(candidate, [{ start: match.start, end: match.end }]),
          overflow
        );
        filter.held = new Uint8Array();
        this.#finishLateProbeFilter(false);
        return output;
      }
      break;
    }
    if (filter.inspected >= MAX_PROBE_BYTES) {
      filter.held = new Uint8Array();
      this.#finishLateProbeFilter(false);
      return concatenateBytes(candidate, overflow);
    }
    const prefixStart = incompleteTerminalResponseStart(candidate);
    if (prefixStart === undefined) {
      filter.held = new Uint8Array();
      this.#cancelLateProbeDeadline(filter);
      return candidate;
    }
    filter.held = candidate.subarray(prefixStart).slice();
    this.#scheduleLateProbeDeadline(filter);
    return candidate.subarray(0, prefixStart).slice();
  }

  #startLateProbeFilter(clock: TerminalClock, protocol: TerminalResponseProtocol<unknown>): void {
    this.#finishLateProbeFilter(true);
    this.#lateResponseFilter = {
      clock,
      protocol,
      inspected: 0,
      held: new Uint8Array(),
      wake: Promise.withResolvers<undefined>()
    };
  }

  #scheduleLateProbeDeadline(filter: LateTerminalResponseFilter): void {
    this.#cancelLateProbeDeadline(filter);
    const controller = new AbortController();
    filter.deadline = controller;
    void filter.clock.sleep(LATE_PROBE_AMBIGUITY_MS, controller.signal).then(
      () => {
        this.#expireLateProbeFilter(filter, controller);
      },
      () => {
        if (!controller.signal.aborted) this.#expireLateProbeFilter(filter, controller);
      }
    );
  }

  #cancelLateProbeDeadline(filter: LateTerminalResponseFilter): void {
    filter.deadline?.abort('terminal_input_probe_prefix_resolved');
    delete filter.deadline;
  }

  #expireLateProbeFilter(filter: LateTerminalResponseFilter, controller: AbortController): void {
    if (this.#lateResponseFilter !== filter || filter.deadline !== controller) return;
    this.#finishLateProbeFilter(true);
  }

  #finishLateProbeFilter(replayHeld: boolean): void {
    const filter = this.#lateResponseFilter;
    if (filter === undefined) return;
    const held = filter.held;
    filter.held = new Uint8Array();
    this.#cancelLateProbeDeadline(filter);
    this.#lateResponseFilter = undefined;
    if (replayHeld && held.byteLength > 0) this.#replayBytes(held);
    filter.wake.resolve(undefined);
  }
}

function signalAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

interface LateTerminalResponseFilter {
  readonly clock: TerminalClock;
  readonly protocol: TerminalResponseProtocol<unknown>;
  readonly wake: PromiseWithResolvers<undefined>;
  inspected: number;
  held: Uint8Array;
  deadline?: AbortController;
}

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

const kittyKeyboardResponseProtocol: TerminalResponseProtocol<number> = Object.freeze({
  classify(control: Uint8Array): TerminalResponseClassification<number> | undefined {
    const body = csiBody(control);
    if (body === undefined || body.length < 3 || body[0] !== questionMark) return undefined;
    const final = body.at(-1);
    if (final === lowercaseU) {
      const digits = body.subarray(1, body.length - 1);
      if (
        digits.length === 0
        || digits.length > MAX_KITTY_FLAG_DIGITS
        || !digits.every(isDecimalDigit)
      ) return undefined;
      const flags = decimalBytes(digits);
      return flags === undefined ? undefined : { kind: 'matched', value: flags };
    }
    if (final === lowercaseC && validPrimaryDeviceAttributes(body.subarray(1, body.length - 1))) {
      return { kind: 'fence' };
    }
    return undefined;
  }
});

const questionMark = 0x3f;
const semicolon = 0x3b;
const lowercaseC = 0x63;
const lowercaseU = 0x75;

function validPrimaryDeviceAttributes(parameters: Uint8Array): boolean {
  return parameters.length > 0
    && parameters.every((byte) => isDecimalDigit(byte) || byte === semicolon);
}

function isDecimalDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

function concatenateBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const populated = parts.filter((part) => part.byteLength > 0);
  if (populated.length === 0) return new Uint8Array();
  if (populated.length === 1) return populated[0]?.slice() ?? new Uint8Array();
  const result = new Uint8Array(populated.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of populated) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function bytesExcluding(bytes: Uint8Array, ranges: readonly ByteRange[]): Uint8Array {
  return concatenateBytes(...bytePartsExcluding(bytes, ranges));
}

function bytePartsExcluding(bytes: Uint8Array, ranges: readonly ByteRange[]): readonly Uint8Array[] {
  if (ranges.length === 0) return [bytes.slice()];
  const ordered = ranges.toSorted((left, right) => left.start - right.start);
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const range of ordered) {
    const start = Math.max(cursor, Math.min(bytes.byteLength, range.start));
    const end = Math.max(start, Math.min(bytes.byteLength, range.end));
    if (start > cursor) parts.push(bytes.subarray(cursor, start));
    cursor = end;
  }
  if (cursor < bytes.byteLength) parts.push(bytes.subarray(cursor));
  return parts;
}

function decimalBytes(bytes: Uint8Array): number | undefined {
  let value = 0;
  for (const byte of bytes) {
    value = value * 10 + byte - 0x30;
    if (!Number.isSafeInteger(value)) return undefined;
  }
  return value;
}

function bytesFromChunk(chunk: TerminalInputChunk): Uint8Array {
  return typeof chunk.data === 'string' ? new TextEncoder().encode(chunk.data) : chunk.data;
}

function cloneInputChunk(chunk: TerminalInputChunk): TerminalInputChunk {
  return { data: typeof chunk.data === 'string' ? chunk.data : chunk.data.slice() };
}

type ReaderOrProbeFilterOutcome =
  | { readonly kind: 'reader'; readonly result: IteratorResult<TerminalInputChunk> | undefined }
  | { readonly kind: 'filter' };

async function waitForReaderOrProbeFilter(
  pending: Promise<IteratorResult<TerminalInputChunk>>,
  filterWake: Promise<void> | undefined,
  ...candidateSignals: readonly (AbortSignal | undefined)[]
): Promise<ReaderOrProbeFilterOutcome> {
  const signals = [...new Set(candidateSignals.filter((signal): signal is AbortSignal => signal !== undefined))];
  if (signals.some((signal) => signal.aborted)) return { kind: 'reader', result: undefined };
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (outcome: ReaderOrProbeFilterOutcome): void => {
      if (settled) return;
      settled = true;
      detach();
      resolve(outcome);
    };
    const abort = (): void => {
      settle({ kind: 'reader', result: undefined });
    };
    const detach = (): void => {
      for (const signal of signals) signal.removeEventListener('abort', abort);
    };
    for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
    void filterWake?.then(() => {
      settle({ kind: 'filter' });
    });
    void pending.then(
      (result) => {
        settle({ kind: 'reader', result });
      },
      (cause: unknown) => {
        if (settled) return;
        settled = true;
        detach();
        reject(cause instanceof Error ? cause : new Error('Terminal input read failed.', { cause }));
      }
    );
  });
}
