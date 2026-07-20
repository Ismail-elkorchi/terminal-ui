import { errorFromUnknown } from '../errors.ts';
import type { MousePointerEvent } from '../input/index.ts';

export type PointerMotionEvent = MousePointerEvent & { readonly action: 'drag' | 'move' };

export interface PointerMotionCoordinatorOptions<TResult> {
  readonly execute: (event: PointerMotionEvent) => Promise<TResult>;
  readonly reportFailure: (cause: unknown) => void;
  readonly stop: (result: TResult) => boolean;
}

export interface PointerMotionCoordinator<TResult> {
  enqueue(event: PointerMotionEvent): void;
  flush(): Promise<readonly TResult[]>;
  pending(): Promise<readonly TResult[]> | undefined;
  reset(): void;
  dispose(cause: unknown): void;
  settle(): Promise<void>;
}

interface MotionCycle<TResult> {
  readonly promise: Promise<readonly TResult[]>;
  readonly resolve: (results: readonly TResult[]) => void;
}

export function createPointerMotionCoordinator<TResult>(
  options: PointerMotionCoordinatorOptions<TResult>
): PointerMotionCoordinator<TResult> {
  let latest: PointerMotionEvent | undefined;
  let cycle: MotionCycle<TResult> | undefined;
  let disposedCause: unknown;

  return {
    enqueue(event) {
      if (disposedCause !== undefined) throw errorFromUnknown(disposedCause);
      latest = event;
      if (cycle !== undefined) return;
      cycle = createMotionCycle<TResult>();
      const active = cycle;
      queueMicrotask(() => { void drain(active); });
    },
    flush() {
      return cycle?.promise ?? Promise.resolve([]);
    },
    pending: () => cycle?.promise,
    reset() {
      latest = undefined;
    },
    dispose(cause) {
      if (disposedCause !== undefined) return;
      disposedCause = cause;
      latest = undefined;
    },
    async settle() {
      await cycle?.promise;
    }
  };

  async function drain(active: MotionCycle<TResult>): Promise<void> {
    const results: TResult[] = [];
    try {
      while (latest !== undefined && disposedCause === undefined) {
        const event = latest;
        latest = undefined;
        const result = await options.execute(event);
        results.push(result);
        if (options.stop(result)) {
          latest = undefined;
          break;
        }
      }
    } catch (cause) {
      latest = undefined;
      options.reportFailure(cause);
    } finally {
      if (cycle === active) cycle = undefined;
      active.resolve(Object.freeze(results));
    }
  }
}

function createMotionCycle<TResult>(): MotionCycle<TResult> {
  let resolve!: (results: readonly TResult[]) => void;
  const promise = new Promise<readonly TResult[]>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
