import type {
  NodeReadableTerminalStream,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions
} from './types.ts';

export class NodeInput implements TerminalInput {
  #rawMode: boolean;
  #rawModeSet = false;
  #activeReader: NativeNodeInputIterator | undefined;
  readonly #stream: NodeReadableTerminalStream;

  constructor(stream: NodeReadableTerminalStream) {
    this.#stream = stream;
    this.#rawMode = stream.isRaw === true;
  }

  read(options: TerminalInputReadOptions = {}): AsyncIterable<TerminalInputChunk> {
    return {
      [Symbol.asyncIterator]: () => this.createIterator(options.signal)
    };
  }

  async dispose(): Promise<void> {
    const active = this.#activeReader;
    this.#activeReader = undefined;
    await active?.close();
    this.#stream.pause?.();
    this.#stream.unref?.();
  }

  setRawMode(enabled: boolean): void {
    if (typeof this.#stream.setRawMode === 'function' && this.#stream.isTTY === true) {
      this.#stream.setRawMode(enabled);
      this.#rawMode = enabled;
      this.#rawModeSet = true;
    }
  }

  isRawModeEnabled(): boolean {
    return this.#rawModeSet ? this.#rawMode : this.#stream.isRaw ?? this.#rawMode;
  }

  isTty(): boolean {
    return this.#stream.isTTY === true;
  }

  private createIterator(signal: AbortSignal | undefined): NativeNodeInputIterator {
    if (this.#activeReader !== undefined) {
      throw new Error('Node terminal input already has an active reader.');
    }
    const source = typeof this.#stream.iterator === 'function'
      ? this.#stream.iterator({ destroyOnReturn: false })
      : this.#stream[Symbol.asyncIterator]();
    const reader = new NativeNodeInputIterator(source);
    this.#activeReader = reader;
    reader.onClose(() => {
      if (this.#activeReader === reader) this.#activeReader = undefined;
    });
    if (signal !== undefined) {
      const abort = (): void => { void reader.close(); };
      signal.addEventListener('abort', abort, { once: true });
      reader.onClose(() => {
        signal.removeEventListener('abort', abort);
      });
      if (signal.aborted) void reader.close();
    }
    return reader;
  }
}

class NativeNodeInputIterator implements AsyncIterator<TerminalInputChunk> {
  readonly #closeListeners: (() => void)[] = [];
  readonly #closedPromise: Promise<void>;
  readonly #resolveClosed: () => void;
  readonly #source: AsyncIterator<string | Uint8Array>;
  #closed = false;
  #readPending = false;

  constructor(source: AsyncIterator<string | Uint8Array>) {
    this.#source = source;
    const { promise, resolve } = Promise.withResolvers<undefined>();
    this.#closedPromise = promise;
    this.#resolveClosed = () => { resolve(undefined); };
  }

  async next(): Promise<IteratorResult<TerminalInputChunk>> {
    if (this.#closed) return { done: true, value: undefined };
    this.#readPending = true;
    const sourceRead = this.#source.next().then(
      (result) => ({ kind: 'source' as const, result }),
      (cause: unknown) => {
        throw inputError(cause);
      }
    );
    try {
      const outcome = await Promise.race([
        sourceRead,
        this.#closedPromise.then(() => ({ kind: 'closed' as const }))
      ]);
      if (outcome.kind === 'closed') return { done: true, value: undefined };
      if (outcome.result.done === true) {
        this.finish();
        return { done: true, value: undefined };
      }
      return { done: false, value: { data: outcome.result.value } };
    } catch (cause) {
      this.finish();
      if (isPrematureClose(cause)) return { done: true, value: undefined };
      throw inputError(cause);
    } finally {
      this.#readPending = false;
    }
  }

  async return(): Promise<IteratorResult<TerminalInputChunk>> {
    await this.close();
    return { done: true, value: undefined };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#resolveClosed();
    const completion = this.#source.return?.();
    if (completion !== undefined) {
      if (this.#readPending) void completion.catch(() => undefined);
      else await completion;
    }
    this.notifyClosed();
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener();
    else this.#closeListeners.push(listener);
  }

  private finish(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#resolveClosed();
    this.notifyClosed();
  }

  private notifyClosed(): void {
    const listeners = this.#closeListeners.splice(0);
    for (const listener of listeners) listener();
  }
}

function inputError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  if (typeof cause === 'string') return new Error(cause);
  return new Error('Node terminal input failed.');
}

function isPrematureClose(cause: unknown): boolean {
  return cause instanceof Error
    && 'code' in cause
    && cause.code === 'ERR_STREAM_PREMATURE_CLOSE';
}
