import { throwIfTerminalOperationAborted, waitForTerminalOperation } from './operation.ts';
import type { TerminalHost, TerminalOperationContext, TerminalOutput, TerminalOutputChunk } from './types.ts';

export class OrderedOutputQueue {
  #tail: Promise<void> | undefined;
  #failure: Error | undefined;

  run(
    operation: (context: TerminalOperationContext) => Promise<void>,
    context: TerminalOperationContext = {}
  ): Promise<void> {
    const invoke = async (): Promise<void> => {
      throwIfTerminalOperationAborted(context);
      await operation(context);
    };
    let result: Promise<void>;
    try {
      result = this.#tail === undefined ? invoke() : this.#tail.then(invoke);
    } catch (cause) {
      result = Promise.reject(asError(cause));
    }
    const settled = result.then(
      () => undefined,
      (cause: unknown) => {
        this.#failure ??= asError(cause);
      }
    );
    this.#tail = settled;
    void settled.then(() => {
      if (this.#tail === settled) this.#tail = undefined;
    });
    return waitForTerminalOperation(result, context);
  }

  async flush(context: TerminalOperationContext = {}): Promise<void> {
    throwIfTerminalOperationAborted(context);
    if (this.#tail !== undefined) await waitForTerminalOperation(this.#tail, context);
    const failure = this.#failure;
    this.#failure = undefined;
    if (failure !== undefined) throw failure;
  }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export interface TerminalHostOutputAuthority {
  readonly write: TerminalHost['write'];
  readonly flush: TerminalHost['flush'];
  readonly dispose: TerminalHost['dispose'];
}

export function createTerminalHostOutputAuthority(
  stdout: TerminalOutput,
  stderr?: TerminalOutput
): TerminalHostOutputAuthority {
  const queue = new OrderedOutputQueue();
  return {
    write: (chunk: TerminalOutputChunk, context = {}) => queue.run(async (operationContext) => {
      if (chunk.text !== undefined) await stdout.write(chunk.text, operationContext);
      if (chunk.bytes !== undefined) await stdout.write(chunk.bytes, operationContext);
    }, context),
    flush: async (context = {}) => {
      let failure: Error | undefined;
      for (const flush of [
        () => queue.flush(context),
        () => stdout.flush(context),
        ...(stderr === undefined ? [] : [() => stderr.flush(context)])
      ]) {
        try {
          await flush();
        } catch (cause) {
          failure ??= asError(cause);
        }
      }
      if (failure !== undefined) throw failure;
    },
    dispose: async (context = {}) => {
      let failure: Error | undefined;
      const outputs = stderr === undefined || stderr === stdout ? [stdout] : [stdout, stderr];
      for (const dispose of [
        () => queue.flush(context),
        ...outputs.map((terminalOutput) => () => terminalOutput.dispose(context))
      ]) {
        try {
          await dispose();
        } catch (cause) {
          failure ??= asError(cause);
        }
      }
      if (failure !== undefined) throw failure;
    }
  };
}
