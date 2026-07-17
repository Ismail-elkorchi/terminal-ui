import type { TerminalHost, TerminalOutput, TerminalOutputChunk } from './types.ts';

export class OrderedOutputQueue {
  #tail: Promise<void> | undefined;
  #failure: Error | undefined;

  run(operation: () => Promise<void>): Promise<void> {
    const invoke = async (): Promise<void> => {
      await operation();
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
    return result;
  }

  async flush(): Promise<void> {
    await this.#tail;
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
}

export function createTerminalHostOutputAuthority(
  stdout: TerminalOutput,
  stderr?: TerminalOutput
): TerminalHostOutputAuthority {
  const queue = new OrderedOutputQueue();
  return {
    write: (chunk: TerminalOutputChunk) => queue.run(async () => {
      if (chunk.text !== undefined) await stdout.write(chunk.text);
      if (chunk.bytes !== undefined) await stdout.write(chunk.bytes);
    }),
    flush: async () => {
      let failure: Error | undefined;
      for (const flush of [
        () => queue.flush(),
        () => stdout.flush(),
        ...(stderr === undefined ? [] : [() => stderr.flush()])
      ]) {
        try {
          await flush();
        } catch (cause) {
          failure ??= asError(cause);
        }
      }
      if (failure !== undefined) throw failure;
    }
  };
}
