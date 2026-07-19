import { errorFromUnknown } from '../errors.ts';

export interface ResizeCoordinator<TViewport, TResult> {
  request(viewport: TViewport): Promise<TResult>;
  dispose(cause: unknown): void;
}

interface ResizeCycle<TResult> {
  readonly promise: Promise<TResult>;
  readonly resolve: (result: TResult) => void;
  readonly reject: (cause: unknown) => void;
}

export function createResizeCoordinator<TViewport, TResult>(
  execute: (viewport: TViewport) => Promise<TResult>
): ResizeCoordinator<TViewport, TResult> {
  let latest: TViewport | undefined;
  let disposedCause: unknown;
  let cycle: ResizeCycle<TResult> | undefined;

  return {
    request(viewport) {
      if (disposedCause !== undefined) return Promise.reject(errorFromUnknown(disposedCause));
      latest = viewport;
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
        const viewport = latest;
        latest = undefined;
        result = await execute(viewport);
      }
      if (disposedCause !== undefined) return;
      if (result === undefined) throw new Error('Resize coordinator completed without a viewport.');
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
  let resolve!: (result: TResult) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<TResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
