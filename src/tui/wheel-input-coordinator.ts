import {
  appendWheelInput,
  createWheelInputBatch,
  DEFAULT_WHEEL_BATCH_WINDOW_MS,
  wheelInputBatchAccepts
} from './wheel-input-batch.ts';
import type { MouseWheelEvent } from '../input/index.ts';
import type { TerminalClock } from '../host/types.ts';
import type { WheelInputBatch } from './wheel-input-batch.ts';

interface PendingWheelInput<TResult> {
  batch: WheelInputBatch;
  readonly controller: AbortController;
  completion: Promise<readonly TResult[]>;
}

interface TrackedWheelTask<TResult> {
  completion: Promise<readonly TResult[]>;
}

const WHEEL_FLUSH = Symbol('terminal-ui.wheel-flush');
const WHEEL_RESET = Symbol('terminal-ui.wheel-reset');

export interface WheelInputCoordinatorOptions<TResult> {
  readonly clock: TerminalClock;
  readonly execute: (batch: WheelInputBatch) => Promise<readonly TResult[]>;
  readonly reportFailure: (cause: unknown) => void;
  readonly batchWindowMs?: number;
}

export interface WheelInputCoordinator<TResult> {
  enqueue(event: MouseWheelEvent, targetId: string | undefined): Promise<readonly TResult[]>;
  flush(): Promise<readonly TResult[]>;
  pending(): Promise<readonly TResult[]> | undefined;
  reset(): void;
  settle(): Promise<void>;
}

export function createWheelInputCoordinator<TResult>(
  options: WheelInputCoordinatorOptions<TResult>
): WheelInputCoordinator<TResult> {
  const tasks = new Set<TrackedWheelTask<TResult>>();
  const batchWindowMs = options.batchWindowMs ?? DEFAULT_WHEEL_BATCH_WINDOW_MS;
  let pending: PendingWheelInput<TResult> | undefined;

  return {
    async enqueue(event, targetId) {
      if (pending !== undefined && wheelInputBatchAccepts(pending.batch, event, targetId)) {
        pending.batch = appendWheelInput(pending.batch, event);
        return [];
      }

      const flushed = await flush();
      const controller = new AbortController();
      const next: PendingWheelInput<TResult> = {
        batch: createWheelInputBatch(event, targetId),
        controller,
        completion: Promise.resolve([])
      };
      pending = next;
      next.completion = trackTask(
        options.clock
          .sleep(batchWindowMs, controller.signal)
          .then((outcome) => outcome === 'elapsed' || controller.signal.reason === WHEEL_FLUSH
            ? executePending(next)
            : [])
      );
      return flushed;
    },
    flush,
    pending: () => pending?.completion,
    reset,
    async settle() {
      await Promise.allSettled([...tasks].map((task) => task.completion));
    }
  };

  function trackTask(task: Promise<readonly TResult[]>): Promise<readonly TResult[]> {
    const tracked: TrackedWheelTask<TResult> = { completion: Promise.resolve([]) };
    tracked.completion = task
      .catch((cause: unknown) => {
        options.reportFailure(cause);
        return [];
      })
      .then((results) => {
        tasks.delete(tracked);
        return results;
      });
    tasks.add(tracked);
    return tracked.completion;
  }

  function flush(): Promise<readonly TResult[]> {
    if (pending === undefined) return Promise.resolve([]);
    pending.controller.abort(WHEEL_FLUSH);
    return pending.completion;
  }

  async function executePending(candidate: PendingWheelInput<TResult>): Promise<readonly TResult[]> {
    if (pending !== candidate) return [];
    pending = undefined;
    return options.execute(candidate.batch);
  }

  function reset(): void {
    const candidate = pending;
    pending = undefined;
    candidate?.controller.abort(WHEEL_RESET);
  }
}
