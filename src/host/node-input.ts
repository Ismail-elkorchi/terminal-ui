import type {
  NodeReadableTerminalStream,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions
} from './types.ts';

export class NodeInput implements TerminalInput {
  #rawMode = false;
  readonly #activeReaders = new Set<ClosableNodeInputIterator>();
  readonly #stream: NodeReadableTerminalStream;

  constructor(stream: NodeReadableTerminalStream) {
    this.#stream = stream;
  }

  read(options: TerminalInputReadOptions = {}): AsyncIterable<TerminalInputChunk> {
    return {
      [Symbol.asyncIterator]: () => this.createIterator(options.signal)
    };
  }

  async dispose(): Promise<void> {
    const active = [...this.#activeReaders];
    this.#activeReaders.clear();
    await Promise.allSettled(active.map(async (reader) => reader.close()));
    this.#stream.pause?.();
    this.#stream.unref?.();
  }

  setRawMode(enabled: boolean): void {
    if (typeof this.#stream.setRawMode === 'function' && this.#stream.isTTY === true) {
      this.#stream.setRawMode(enabled);
      this.#rawMode = enabled;
    }
  }

  isRawModeEnabled(): boolean {
    return this.#rawMode;
  }

  isTty(): boolean {
    return this.#stream.isTTY === true;
  }

  private createIterator(signal: AbortSignal | undefined): ClosableNodeInputIterator {
    const reader = hasEventReader(this.#stream)
      ? new EventNodeInputIterator(this.#stream)
      : new IterableNodeInputIterator(this.#stream[Symbol.asyncIterator]());
    this.#activeReaders.add(reader);
    reader.onClose(() => this.#activeReaders.delete(reader));
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

interface ClosableNodeInputIterator extends AsyncIterator<TerminalInputChunk> {
  close(): Promise<void>;
  onClose(listener: () => void): void;
}

interface NodeEventReadableStream extends NodeReadableTerminalStream {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

interface NodeInputWaiter {
  readonly resolve: (result: IteratorResult<TerminalInputChunk>) => void;
  readonly reject: (cause: unknown) => void;
}

class EventNodeInputIterator implements ClosableNodeInputIterator {
  readonly #queued: TerminalInputChunk[] = [];
  readonly #waiters: NodeInputWaiter[] = [];
  readonly #closeListeners: (() => void)[] = [];
  #closed = false;
  #failure: Error | undefined;
  readonly #stream: NodeEventReadableStream;

  readonly #onData = (...args: unknown[]): void => {
    if (this.#closed) return;
    const chunk = args[0];
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) return;
    const value = { data: chunk };
    const waiter = this.#waiters.shift();
    if (waiter === undefined) this.#queued.push(value);
    else waiter.resolve({ done: false, value });
  };

  readonly #onEnd = (): void => {
    void this.close();
  };

  readonly #onError = (...args: unknown[]): void => {
    if (this.#closed) return;
    this.#closed = true;
    this.#failure = inputError(args[0]);
    const waiters = this.#waiters.splice(0);
    this.detach();
    this.#stream.pause?.();
    for (const waiter of waiters) waiter.reject(this.#failure);
    this.notifyClosed();
  };

  constructor(stream: NodeEventReadableStream) {
    this.#stream = stream;
    stream.on('data', this.#onData);
    stream.on('end', this.#onEnd);
    stream.on('close', this.#onEnd);
    stream.on('error', this.#onError);
    stream.resume?.();
  }

  next(): Promise<IteratorResult<TerminalInputChunk>> {
    const value = this.#queued.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    if (this.#closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => this.#waiters.push({ resolve, reject }));
  }

  return(): Promise<IteratorResult<TerminalInputChunk>> {
    return this.close().then(() => ({ done: true, value: undefined }));
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.detach();
    this.#stream.pause?.();
    const waiters = this.#waiters.splice(0);
    for (const waiter of waiters) waiter.resolve({ done: true, value: undefined });
    this.notifyClosed();
    return Promise.resolve();
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener();
    else this.#closeListeners.push(listener);
  }

  private detach(): void {
    this.#stream.off('data', this.#onData);
    this.#stream.off('end', this.#onEnd);
    this.#stream.off('close', this.#onEnd);
    this.#stream.off('error', this.#onError);
  }

  private notifyClosed(): void {
    const listeners = this.#closeListeners.splice(0);
    for (const listener of listeners) listener();
  }
}

class IterableNodeInputIterator implements ClosableNodeInputIterator {
  readonly #closeListeners: (() => void)[] = [];
  #closed = false;
  readonly #source: AsyncIterator<string | Uint8Array>;

  constructor(source: AsyncIterator<string | Uint8Array>) {
    this.#source = source;
  }

  async next(): Promise<IteratorResult<TerminalInputChunk>> {
    const result = await this.#source.next();
    if (result.done === true) {
      await this.close();
      return { done: true, value: undefined };
    }
    return { done: false, value: { data: result.value } };
  }

  async return(): Promise<IteratorResult<TerminalInputChunk>> {
    await this.close();
    return { done: true, value: undefined };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#source.return?.();
    const listeners = this.#closeListeners.splice(0);
    for (const listener of listeners) listener();
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener();
    else this.#closeListeners.push(listener);
  }
}

function hasEventReader(stream: NodeReadableTerminalStream): stream is NodeEventReadableStream {
  return typeof stream.on === 'function' && typeof stream.off === 'function';
}

function inputError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  if (typeof cause === 'string') return new Error(cause);
  return new Error('Node terminal input failed.');
}
