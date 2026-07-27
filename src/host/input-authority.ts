import type {
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions
} from './types.ts';
import { settleResourceDisposal } from './dispose.ts';

const KITTY_QUERY_PREFIX = Uint8Array.of(0x1b, 0x5b, 0x3f);
const KITTY_QUERY_TERMINATOR = 0x75;
const MAX_PROBE_BYTES = 64 * 1024;

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
  #release: Promise<void> | undefined;
  #disposal: Promise<void> | undefined;
  #readerActive = false;
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

  async probeKittyKeyboard(signal: AbortSignal): Promise<KittyKeyboardProbeResult> {
    this.#acquireReader();
    const buffered: Uint8Array[] = [];
    let byteCount = 0;
    try {
      while (!signal.aborted && byteCount <= MAX_PROBE_BYTES) {
        const result = await this.#next(signal);
        if (result.done) break;
        const bytes = bytesFromChunk(result.value);
        buffered.push(bytes);
        byteCount += bytes.byteLength;
        const combined = concatenateBytes(buffered, byteCount);
        const match = findKittyKeyboardResponse(combined);
        if (match !== undefined) {
          this.#replayBytes(combined.subarray(0, match.start));
          this.#replayBytes(combined.subarray(match.end));
          return { status: 'supported', flags: match.flags };
        }
      }
      this.#replayBytes(concatenateBytes(buffered, byteCount));
      return { status: 'inconclusive' };
    } finally {
      this.#readerActive = false;
    }
  }

  dispose(): Promise<void> {
    if (this.#disposal !== undefined) return this.#disposal;
    this.#disposed = true;
    this.#sourceController.abort('terminal_input_disposed');
    const iterator = this.#iterator;
    const pending = this.#pending;
    const iteratorClose = Promise.resolve()
      .then(async () => iterator?.return?.())
      .then(() => undefined);
    void iteratorClose.catch(() => undefined);
    this.#disposal = settleResourceDisposal([
      async () => {
        await pending;
      },
      async () => {
        await iteratorClose;
      },
      async () => {
        await this.#disposeSource?.();
      }
    ]).finally(() => {
      if (this.#pending === pending) this.#pending = undefined;
      this.#readerActive = false;
      this.#replay.length = 0;
    });
    return this.#disposal;
  }

  release(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (this.#readerActive) {
      return Promise.reject(new Error('Terminal input cannot be released while a reader is active.'));
    }
    if (this.#release !== undefined) return this.#release;
    const iterator = this.#iterator;
    const pending = this.#pending;
    if (iterator === undefined) return Promise.resolve();
    const sourceController = this.#sourceController;
    sourceController.abort('terminal_input_released');
    const iteratorClose = Promise.resolve()
      .then(async () => iterator.return?.())
      .then(() => undefined);
    this.#release = Promise.allSettled([
      pending ?? Promise.resolve(),
      iteratorClose
    ]).then((results) => {
      const failures: unknown[] = [];
      for (const result of results) {
        if (result.status === 'rejected') failures.push(result.reason);
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Terminal input release failed.');
    }).finally(() => {
      if (this.#iterator === iterator) this.#iterator = undefined;
      if (this.#pending === pending) this.#pending = undefined;
      if (!this.#disposed && this.#sourceController === sourceController) {
        this.#sourceController = new AbortController();
      }
      this.#release = undefined;
    });
    return this.#release;
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
    this.#acquireReader();
    let closed = false;
    const close = (): Promise<IteratorResult<TerminalInputChunk>> => {
      if (!closed) {
        closed = true;
        this.#readerActive = false;
      }
      return Promise.resolve({ done: true, value: undefined });
    };
    return {
      next: async () => {
        if (closed) return { done: true, value: undefined };
        const result = await this.#next(signal);
        if (result.done) await close();
        return result;
      },
      return: close
    };
  }

  #acquireReader(): void {
    if (this.#disposed) throw new Error('Terminal input is disposed.');
    if (this.#readerActive) throw new Error('Terminal input already has an active reader.');
    this.#readerActive = true;
  }

  async #next(signal: AbortSignal | undefined): Promise<IteratorResult<TerminalInputChunk>> {
    const replay = this.#replay.shift();
    if (replay !== undefined) return { done: false, value: replay };
    if (signal?.aborted === true) return { done: true, value: undefined };
    this.#iterator ??= this.#source.read({ signal: this.#sourceController.signal })[Symbol.asyncIterator]();
    this.#pending ??= this.#iterator.next();
    const pending = this.#pending;
    const result = await waitForReader(pending, signal);
    if (result === undefined) return { done: true, value: undefined };
    if (this.#pending === pending) this.#pending = undefined;
    return result;
  }

  #replayBytes(bytes: Uint8Array): void {
    if (bytes.byteLength > 0) this.#replay.push({ data: bytes.slice() });
  }
}

interface KittyKeyboardResponse {
  readonly start: number;
  readonly end: number;
  readonly flags: number;
}

function findKittyKeyboardResponse(bytes: Uint8Array): KittyKeyboardResponse | undefined {
  for (let start = 0; start <= bytes.byteLength - KITTY_QUERY_PREFIX.byteLength; start += 1) {
    if (!matchesAt(bytes, KITTY_QUERY_PREFIX, start)) continue;
    let cursor = start + KITTY_QUERY_PREFIX.byteLength;
    const digitStart = cursor;
    while (cursor < bytes.byteLength) {
      const byte = bytes[cursor];
      if (byte === undefined || byte < 0x30 || byte > 0x39) break;
      cursor += 1;
    }
    if (cursor === digitStart || cursor >= bytes.byteLength || bytes[cursor] !== KITTY_QUERY_TERMINATOR) continue;
    const flags = decimalBytes(bytes.subarray(digitStart, cursor));
    if (flags !== undefined) return { start, end: cursor + 1, flags };
  }
  return undefined;
}

function matchesAt(bytes: Uint8Array, expected: Uint8Array, start: number): boolean {
  for (let index = 0; index < expected.byteLength; index += 1) {
    if (bytes[start + index] !== expected[index]) return false;
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

function concatenateBytes(chunks: readonly Uint8Array[], byteCount: number): Uint8Array {
  if (byteCount === 0) return new Uint8Array();
  const only = chunks.length === 1 ? chunks[0] : undefined;
  if (only !== undefined) return only.slice();
  const result = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function waitForReader(
  pending: Promise<IteratorResult<TerminalInputChunk>>,
  signal: AbortSignal | undefined
): Promise<IteratorResult<TerminalInputChunk> | undefined> {
  if (signal === undefined) return pending;
  if (signal.aborted) return undefined;
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      resolve(undefined);
    };
    signal.addEventListener('abort', abort, { once: true });
    void pending.then(
      (result) => {
        signal.removeEventListener('abort', abort);
        resolve(result);
      },
      (cause: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(cause instanceof Error ? cause : new Error('Terminal input read failed.', { cause }));
      }
    );
  });
}
