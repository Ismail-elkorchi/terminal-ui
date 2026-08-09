import { errorFromUnknown } from '../errors.ts';
import type { MousePointerEvent } from '../input/index.ts';

export type PointerMotionEvent = MousePointerEvent & { readonly action: 'drag' | 'move' };
export interface PointerMotionSample {
  readonly event: PointerMotionEvent;
  readonly occurredAt: number;
}

export interface PointerMotionCoordinatorOptions<TResult> {
  readonly execute: (sample: PointerMotionSample) => Promise<TResult>;
  readonly reportFailure: (cause: unknown) => void;
  readonly stop: (result: TResult) => boolean;
}

export interface PointerMotionCoordinator<TResult> {
  enqueue(sample: PointerMotionSample): void;
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
  let latest: PointerMotionSample | undefined;
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
        const sample = latest;
        latest = undefined;
        const result = await options.execute(sample);
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
  const { promise, resolve } = Promise.withResolvers<readonly TResult[]>();
  return { promise, resolve };
}
