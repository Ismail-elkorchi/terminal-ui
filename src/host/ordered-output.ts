import { throwIfTerminalOperationAborted, waitForTerminalOperation } from './operation.ts';
import {
  committedTerminalWrite,
  failedTerminalWrite,
  indeterminateTerminalWrite
} from './write-receipt.ts';
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
  readonly writeSafety: TerminalHost['writeSafety'];
  readonly flush: TerminalHost['flush'];
  readonly dispose: TerminalHost['dispose'];
}

export function createTerminalHostOutputAuthority(
  stdout: TerminalOutput,
  stderr?: TerminalOutput,
  target = 'terminal-output'
): TerminalHostOutputAuthority {
  const queue = new OrderedOutputQueue();
  return {
    write: async (chunk: TerminalOutputChunk, context = {}) => {
      const progress = { started: false };
      try {
        await queue.run(async (operationContext) => {
          progress.started = true;
          if (chunk.text !== undefined) await stdout.write(chunk.text, operationContext);
          if (chunk.bytes !== undefined) await stdout.write(chunk.bytes, operationContext);
        }, context);
        return committedTerminalWrite();
      } catch (cause) {
        return progress.started
          ? indeterminateTerminalWrite(target, cause)
          : failedTerminalWrite(target, cause);
      }
    },
    writeSafety: async (chunk: TerminalOutputChunk, context = {}) => {
      const parts = [chunk.text, chunk.bytes].filter((part): part is string | Uint8Array => part !== undefined);
      let committedParts = 0;
      for (const part of parts) {
        const receipt = await stdout.writeSafety(part, context);
        if (receipt.status !== 'committed') {
          return committedParts === 0 ? receipt : indeterminateTerminalWrite(target, receipt.diagnostic);
        }
        committedParts += 1;
      }
      return committedTerminalWrite();
    },
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
