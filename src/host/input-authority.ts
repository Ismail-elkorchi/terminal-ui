import type {
  TerminalClock,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions
} from './types.ts';
import { settleResourceDisposal } from './dispose.ts';

const KITTY_QUERY_PREFIX = Uint8Array.of(0x1b, 0x5b, 0x3f);
const KITTY_QUERY_TERMINATOR = 0x75;
const MAX_KITTY_FLAG_DIGITS = String(Number.MAX_SAFE_INTEGER).length;
const MAX_PROBE_BYTES = 64 * 1024;
const LATE_PROBE_AMBIGUITY_MS = 25;

export interface KittyKeyboardProbeResult {
  readonly status: 'supported' | 'inconclusive';
  readonly flags?: number;
}

export class TerminalInputAuthority implements TerminalInput {
  readonly #source: TerminalInput;
  readonly #disposeSource: (() => void | Promise<void>) | undefined;
  #sourceController = new AbortController();
  readonly #replay: TerminalInputChunk[] = [];
  #iterator: AsyncIterator<TerminalInputChunk> | undefined;
  #pending: Promise<IteratorResult<TerminalInputChunk>> | undefined;
  #lateProbeFilter: LateKittyResponseFilter | undefined;
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
    clock: TerminalClock
  ): Promise<KittyKeyboardProbeResult> {
    const owner = this.#acquireReader();
    const buffered = new Uint8Array(MAX_PROBE_BYTES);
    let byteCount = 0;
    let searchStart = 0;
    let overflow: Uint8Array | undefined;
    let bufferedInputHandled = false;
    try {
      while (!signal.aborted && byteCount < MAX_PROBE_BYTES) {
        const result = await this.#next(signal, owner);
        if (result.done) break;
        const bytes = bytesFromChunk(result.value);
        const retainedLength = Math.min(bytes.byteLength, MAX_PROBE_BYTES - byteCount);
        buffered.set(bytes.subarray(0, retainedLength), byteCount);
        byteCount += retainedLength;
        const retained = buffered.subarray(0, byteCount);
        const search = findKittyKeyboardResponse(retained, searchStart);
        if (search.match !== undefined) {
          this.#replayBytes(retained.subarray(0, search.match.start));
          this.#replayBytes(retained.subarray(search.match.end));
          this.#replayBytes(bytes.subarray(retainedLength));
          bufferedInputHandled = true;
          return { status: 'supported', flags: search.match.flags };
        }
        searchStart = search.nextStart;
        if (retainedLength < bytes.byteLength) overflow = bytes.subarray(retainedLength).slice();
      }
      if (signal.aborted) return { status: 'inconclusive' };
      this.#replayBytes(buffered.subarray(0, byteCount));
      if (overflow !== undefined) this.#replayBytes(overflow);
      bufferedInputHandled = true;
      return { status: 'inconclusive' };
    } finally {
      if (!bufferedInputHandled) {
        if (signal.aborted) {
          this.#startLateProbeFilter(clock);
          this.#replayFilteredProbeBytes(buffered.subarray(0, byteCount));
          if (overflow !== undefined) this.#replayFilteredProbeBytes(overflow);
        } else {
          this.#replayBytes(buffered.subarray(0, byteCount));
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
        this.#lateProbeFilter?.wake.promise,
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
    if (this.#lateProbeFilter === undefined) return cloneInputChunk(chunk);
    const filtered = this.#filterProbeBytes(bytesFromChunk(chunk));
    return filtered.byteLength === 0 ? undefined : { data: filtered };
  }

  #filterProbeBytes(bytes: Uint8Array): Uint8Array {
    const filter = this.#lateProbeFilter;
    if (filter === undefined) return bytes.slice();
    const remaining = Math.max(0, MAX_PROBE_BYTES - filter.inspected);
    const retainedLength = Math.min(bytes.byteLength, remaining);
    const candidate = concatenateBytes(filter.held, bytes.subarray(0, retainedLength));
    const overflow = bytes.subarray(retainedLength);
    filter.inspected += retainedLength;
    const match = findKittyKeyboardResponse(candidate, 0).match;
    if (match !== undefined) {
      const output = concatenateBytes(
        candidate.subarray(0, match.start),
        candidate.subarray(match.end),
        overflow
      );
      filter.held = new Uint8Array();
      this.#finishLateProbeFilter(false);
      return output;
    }
    if (filter.inspected >= MAX_PROBE_BYTES) {
      filter.held = new Uint8Array();
      this.#finishLateProbeFilter(false);
      return concatenateBytes(candidate, overflow);
    }
    const prefixStart = incompleteKittyResponseStart(candidate);
    if (prefixStart === undefined) {
      filter.held = new Uint8Array();
      this.#cancelLateProbeDeadline(filter);
      return candidate;
    }
    filter.held = candidate.subarray(prefixStart).slice();
    this.#scheduleLateProbeDeadline(filter);
    return candidate.subarray(0, prefixStart).slice();
  }

  #startLateProbeFilter(clock: TerminalClock): void {
    this.#finishLateProbeFilter(true);
    this.#lateProbeFilter = {
      clock,
      inspected: 0,
      held: new Uint8Array(),
      wake: Promise.withResolvers<undefined>()
    };
  }

  #scheduleLateProbeDeadline(filter: LateKittyResponseFilter): void {
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

  #cancelLateProbeDeadline(filter: LateKittyResponseFilter): void {
    filter.deadline?.abort('terminal_input_probe_prefix_resolved');
    delete filter.deadline;
  }

  #expireLateProbeFilter(filter: LateKittyResponseFilter, controller: AbortController): void {
    if (this.#lateProbeFilter !== filter || filter.deadline !== controller) return;
    this.#finishLateProbeFilter(true);
  }

  #finishLateProbeFilter(replayHeld: boolean): void {
    const filter = this.#lateProbeFilter;
    if (filter === undefined) return;
    const held = filter.held;
    filter.held = new Uint8Array();
    this.#cancelLateProbeDeadline(filter);
    this.#lateProbeFilter = undefined;
    if (replayHeld && held.byteLength > 0) this.#replayBytes(held);
    filter.wake.resolve(undefined);
  }
}

interface LateKittyResponseFilter {
  readonly clock: TerminalClock;
  readonly wake: PromiseWithResolvers<undefined>;
  inspected: number;
  held: Uint8Array;
  deadline?: AbortController;
}

interface KittyKeyboardResponse {
  readonly start: number;
  readonly end: number;
  readonly flags: number;
}

function findKittyKeyboardResponse(
  bytes: Uint8Array,
  startAt: number
): { readonly match?: KittyKeyboardResponse; readonly nextStart: number } {
  for (let start = startAt; start <= bytes.byteLength - KITTY_QUERY_PREFIX.byteLength; start += 1) {
    if (!matchesAt(bytes, KITTY_QUERY_PREFIX, start)) continue;
    let cursor = start + KITTY_QUERY_PREFIX.byteLength;
    const digitStart = cursor;
    while (cursor < bytes.byteLength) {
      const byte = bytes[cursor];
      if (byte === undefined || byte < 0x30 || byte > 0x39) break;
      cursor += 1;
      if (cursor - digitStart > MAX_KITTY_FLAG_DIGITS) break;
    }
    if (cursor - digitStart > MAX_KITTY_FLAG_DIGITS) continue;
    if (cursor >= bytes.byteLength) return { nextStart: start };
    if (cursor === digitStart || bytes[cursor] !== KITTY_QUERY_TERMINATOR) continue;
    const flags = decimalBytes(bytes.subarray(digitStart, cursor));
    if (flags !== undefined) return { match: { start, end: cursor + 1, flags }, nextStart: cursor + 1 };
  }
  return { nextStart: Math.max(startAt, bytes.byteLength - KITTY_QUERY_PREFIX.byteLength + 1) };
}

function incompleteKittyResponseStart(bytes: Uint8Array): number | undefined {
  const maximumPrefixLength = KITTY_QUERY_PREFIX.byteLength + MAX_KITTY_FLAG_DIGITS;
  const firstCandidate = Math.max(0, bytes.byteLength - maximumPrefixLength);
  for (let start = firstCandidate; start < bytes.byteLength; start += 1) {
    const length = bytes.byteLength - start;
    if (length <= KITTY_QUERY_PREFIX.byteLength) {
      if (matchesPrefix(bytes.subarray(start), KITTY_QUERY_PREFIX)) return start;
      continue;
    }
    if (!matchesAt(bytes, KITTY_QUERY_PREFIX, start)) continue;
    const digits = bytes.subarray(start + KITTY_QUERY_PREFIX.byteLength);
    if (
      digits.byteLength <= MAX_KITTY_FLAG_DIGITS
      && digits.every((byte) => byte >= 0x30 && byte <= 0x39)
    ) return start;
  }
  return undefined;
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

function matchesAt(bytes: Uint8Array, expected: Uint8Array, start: number): boolean {
  for (let index = 0; index < expected.byteLength; index += 1) {
    if (bytes[start + index] !== expected[index]) return false;
  }
  return true;
}

function matchesPrefix(actual: Uint8Array, expected: Uint8Array): boolean {
  if (actual.byteLength > expected.byteLength) return false;
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
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
