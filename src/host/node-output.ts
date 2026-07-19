import { OrderedOutputQueue } from './ordered-output.ts';
import { throwIfTerminalOperationAborted } from './operation.ts';
import type { NodeWritableTerminalStream, TerminalOperationContext, TerminalOutput } from './types.ts';

export class NodeTerminalOutput implements TerminalOutput {
  readonly #queue = new OrderedOutputQueue();
  readonly #stream: NodeWritableTerminalStream;

  constructor(stream: NodeWritableTerminalStream) {
    validateNodeWritableTerminalStream(stream);
    this.#stream = stream;
  }

  get columns(): number | undefined {
    return this.#stream.columns;
  }

  get rows(): number | undefined {
    return this.#stream.rows;
  }

  write(chunk: string | Uint8Array, context: TerminalOperationContext = {}): Promise<void> {
    return this.#queue.run((operationContext) => writeNodeChunk(this.#stream, chunk, operationContext), context);
  }

  flush(context: TerminalOperationContext = {}): Promise<void> {
    return this.#queue.flush(context);
  }

  dispose(context: TerminalOperationContext = {}): Promise<void> {
    return this.flush(context);
  }

  isTty(): boolean {
    return this.#stream.isTTY === true;
  }
}

function writeNodeChunk(
  stream: NodeWritableTerminalStream,
  chunk: string | Uint8Array,
  context: TerminalOperationContext
): Promise<void> {
  throwIfTerminalOperationAborted(context);
  return new Promise((resolve, reject) => {
    let callbackComplete = false;
    let drainComplete = true;
    let writeReturned = false;
    let settled = false;

    const cleanup = (): void => {
      stream.off('error', onError);
      stream.off('close', onClose);
      stream.off('drain', onDrain);
    };
    const fail = (cause: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    };
    const complete = (): void => {
      if (settled || !writeReturned || !callbackComplete || !drainComplete) return;
      settled = true;
      cleanup();
      resolve();
    };
    const writeIsPending = (): boolean => !settled;
    const onError = (cause: unknown): void => { fail(cause); };
    const onClose = (): void => { fail(new Error('Terminal output stream closed before the write completed.')); };
    const onDrain = (): void => {
      drainComplete = true;
      complete();
    };
    stream.once('error', onError);
    stream.once('close', onClose);
    try {
      const accepted = stream.write(chunk, (cause?: Error | null) => {
        if (cause !== undefined && cause !== null) {
          fail(cause);
          return;
        }
        callbackComplete = true;
        complete();
      });
      writeReturned = true;
      if (!accepted && writeIsPending()) {
        drainComplete = false;
        stream.once('drain', onDrain);
      }
      complete();
    } catch (cause) {
      fail(cause);
    }
  });
}

function validateNodeWritableTerminalStream(stream: NodeWritableTerminalStream): void {
  if (typeof stream.write !== 'function' || typeof stream.once !== 'function' || typeof stream.off !== 'function') {
    throw new TypeError('Node terminal output requires write(), once(), and off() methods.');
  }
}
