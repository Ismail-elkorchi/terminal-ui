import { errorFromUnknown } from '../errors.ts';

export interface ResizeCoordinator<TTerminalSize, TResult> {
  request(terminalSize: TTerminalSize): Promise<TResult>;
  dispose(cause: unknown): void;
}

interface ResizeCycle<TResult> {
  readonly promise: Promise<TResult>;
  readonly resolve: (result: TResult) => void;
  readonly reject: (cause: unknown) => void;
}

export function createResizeCoordinator<TTerminalSize, TResult>(
  execute: (terminalSize: TTerminalSize) => Promise<TResult>
): ResizeCoordinator<TTerminalSize, TResult> {
  let latest: TTerminalSize | undefined;
  let disposedCause: unknown;
  let cycle: ResizeCycle<TResult> | undefined;

  return {
    request(terminalSize) {
      if (disposedCause !== undefined) return Promise.reject(errorFromUnknown(disposedCause));
      latest = terminalSize;
      if (cycle === undefined) {
        cycle = createResizeCycle<TResult>();
        const activeCycle = cycle;
        queueMicrotask(() => { void drain(activeCycle); });
      }
      return cycle.promise;
    },
    dispose(cause) {
      if (disposedCause !== undefined) return;
      disposedCause = cause;
      latest = undefined;
      const activeCycle = cycle;
      cycle = undefined;
      activeCycle?.reject(errorFromUnknown(cause));
    }
  };

  async function drain(activeCycle: ResizeCycle<TResult>): Promise<void> {
    let result: TResult | undefined;
    try {
      while (latest !== undefined && disposedCause === undefined) {
        const terminalSize = latest;
        latest = undefined;
        result = await execute(terminalSize);
      }
      if (disposedCause !== undefined) return;
      if (result === undefined) throw new Error('Resize coordinator completed without a terminal size.');
      activeCycle.resolve(result);
    } catch (cause) {
      latest = undefined;
      activeCycle.reject(errorFromUnknown(cause));
    } finally {
      if (cycle === activeCycle) cycle = undefined;
    }
  }
}

function createResizeCycle<TResult>(): ResizeCycle<TResult> {
  const { promise, resolve, reject } = Promise.withResolvers<TResult>();
  return { promise, resolve, reject };
}
