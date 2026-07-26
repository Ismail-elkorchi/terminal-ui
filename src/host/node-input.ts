import type {
  NodeReadableTerminalStream,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions
} from './types.ts';

export class NodeInput implements TerminalInput {
  #rawMode: boolean;
  #rawModeSet = false;
  #activeReader: ClosableNodeInputIterator | undefined;
  #disposal: Promise<void> | undefined;
  #disposed = false;
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

  dispose(): Promise<void> {
    this.#disposal ??= this.disposeOnce();
    return this.#disposal;
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

  private async disposeOnce(): Promise<void> {
    this.#disposed = true;
    try {
      await this.#activeReader?.close();
    } finally {
      this.#stream.pause?.();
      this.#stream.unref?.();
    }
  }

  private createIterator(signal: AbortSignal | undefined): ClosableNodeInputIterator {
    if (this.#disposed) return closedIterator();
    if (this.#activeReader !== undefined) {
      throw new Error('Node terminal input already has an active reader.');
    }
    const reader = hasEventReader(this.#stream)
      ? new EventNodeInputIterator(this.#stream)
      : new IterableNodeInputIterator(
          typeof this.#stream.iterator === 'function'
            ? this.#stream.iterator({ destroyOnReturn: false })
            : this.#stream[Symbol.asyncIterator]()
        );
    this.#activeReader = reader;
    reader.onClose(() => {
      if (this.#activeReader === reader) this.#activeReader = undefined;
    });
    if (signal !== undefined) {
      const abort = (): void => {
        void reader.close().catch(() => undefined);
      };
      signal.addEventListener('abort', abort, { once: true });
      reader.onClose(() => {
        signal.removeEventListener('abort', abort);
      });
      if (signal.aborted) abort();
    }
    return reader;
  }
}

interface ClosableNodeInputIterator extends AsyncIterator<TerminalInputChunk> {
  close(): Promise<void>;
  onClose(listener: () => void): void;
}

interface NodeEventReadableStream extends NodeReadableTerminalStream {
  on(event: 'data' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void): void;
  off(event: 'data' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void): void;
}

interface NodeInputWaiter {
  readonly resolve: (result: IteratorResult<TerminalInputChunk>) => void;
  readonly reject: (cause: unknown) => void;
}

class EventNodeInputIterator implements ClosableNodeInputIterator {
  readonly #closeListeners: (() => void)[] = [];
  #closed = false;
  #failure: Error | undefined;
  #queued: TerminalInputChunk | undefined;
  #waiter: NodeInputWaiter | undefined;
  readonly #stream: NodeEventReadableStream;

  readonly #onData = (...args: unknown[]): void => {
    if (this.#closed) return;
    const chunk = args[0];
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) return;
    this.#stream.pause?.();
    const value = { data: chunk };
    const waiter = this.#waiter;
    if (waiter !== undefined) {
      this.#waiter = undefined;
      waiter.resolve({ done: false, value });
      return;
    }
    if (this.#queued === undefined) {
      this.#queued = value;
      return;
    }
    this.finish(new Error('Node terminal input produced more than one chunk without read demand.'));
  };

  readonly #onEnd = (): void => {
    this.finish();
  };

  readonly #onError = (...args: unknown[]): void => {
    this.finish(inputError(args[0]));
  };

  constructor(stream: NodeEventReadableStream) {
    this.#stream = stream;
    stream.pause?.();
    stream.on('data', this.#onData);
    stream.on('end', this.#onEnd);
    stream.on('close', this.#onEnd);
    stream.on('error', this.#onError);
  }

  next(): Promise<IteratorResult<TerminalInputChunk>> {
    const queued = this.#queued;
    if (queued !== undefined) {
      this.#queued = undefined;
      return Promise.resolve({ done: false, value: queued });
    }
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    if (this.#closed) return Promise.resolve({ done: true, value: undefined });
    if (this.#waiter !== undefined) {
      return Promise.reject(new Error('Node terminal input already has a pending read.'));
    }
    const promise = new Promise<IteratorResult<TerminalInputChunk>>((resolve, reject) => {
      this.#waiter = { resolve, reject };
    });
    this.#stream.resume?.();
    return promise;
  }

  async return(): Promise<IteratorResult<TerminalInputChunk>> {
    await this.close();
    return { done: true, value: undefined };
  }

  close(): Promise<void> {
    this.finish();
    return Promise.resolve();
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener();
    else this.#closeListeners.push(listener);
  }

  private finish(failure?: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#failure = failure;
    this.#queued = undefined;
    this.#stream.off('data', this.#onData);
    this.#stream.off('end', this.#onEnd);
    this.#stream.off('close', this.#onEnd);
    this.#stream.off('error', this.#onError);
    this.#stream.pause?.();
    const waiter = this.#waiter;
    this.#waiter = undefined;
    if (waiter !== undefined) {
      if (failure === undefined) waiter.resolve({ done: true, value: undefined });
      else waiter.reject(failure);
    }
    const listeners = this.#closeListeners.splice(0);
    for (const listener of listeners) listener();
  }
}

class IterableNodeInputIterator implements ClosableNodeInputIterator {
  readonly #closeListeners: (() => void)[] = [];
  readonly #closeRequested: Promise<void>;
  readonly #resolveCloseRequested: () => void;
  readonly #source: AsyncIterator<string | Uint8Array>;
  #closePromise: Promise<void> | undefined;
  #closed = false;
  #readPending = false;

  constructor(source: AsyncIterator<string | Uint8Array>) {
    this.#source = source;
    const { promise, resolve } = Promise.withResolvers<undefined>();
    this.#closeRequested = promise;
    this.#resolveCloseRequested = () => { resolve(undefined); };
  }

  async next(): Promise<IteratorResult<TerminalInputChunk>> {
    if (this.#closed || this.#closePromise !== undefined) return { done: true, value: undefined };
    if (this.#readPending) throw new Error('Node terminal input already has a pending read.');
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
        this.#closeRequested.then(() => ({ kind: 'closed' as const }))
      ]);
      if (outcome.kind === 'closed') return { done: true, value: undefined };
      if (outcome.result.done === true) {
        this.finish();
        return { done: true, value: undefined };
      }
      return { done: false, value: { data: outcome.result.value } };
    } catch (cause) {
      if (this.isClosing()) return { done: true, value: undefined };
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

  close(): Promise<void> {
    if (this.#closed) return this.#closePromise ?? Promise.resolve();
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#resolveCloseRequested();
    this.#closePromise = Promise.resolve()
      .then(async () => this.#source.return?.())
      .then(() => undefined)
      .finally(() => {
        this.#closed = true;
        this.notifyClosed();
      });
    return this.#closePromise;
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener();
    else this.#closeListeners.push(listener);
  }

  private finish(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#resolveCloseRequested();
    this.notifyClosed();
  }

  private isClosing(): boolean {
    return this.#closePromise !== undefined;
  }

  private notifyClosed(): void {
    const listeners = this.#closeListeners.splice(0);
    for (const listener of listeners) listener();
  }
}

function closedIterator(): ClosableNodeInputIterator {
  return {
    next: () => Promise.resolve({ done: true, value: undefined }),
    return: () => Promise.resolve({ done: true, value: undefined }),
    close: () => Promise.resolve(),
    onClose: (listener) => { listener(); }
  };
}

function hasEventReader(stream: NodeReadableTerminalStream): stream is NodeEventReadableStream {
  return typeof stream.on === 'function' && typeof stream.off === 'function';
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
