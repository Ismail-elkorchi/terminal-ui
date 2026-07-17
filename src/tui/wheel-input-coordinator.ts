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

interface OwnedWheelTask<TResult> {
  completion: Promise<readonly TResult[]>;
}

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
  const tasks = new Set<OwnedWheelTask<TResult>>();
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
      next.completion = ownTask(
        options.clock
          .sleep(batchWindowMs, controller.signal)
          .then(() => executePending(next))
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

  function ownTask(task: Promise<readonly TResult[]>): Promise<readonly TResult[]> {
    const owned: OwnedWheelTask<TResult> = { completion: Promise.resolve([]) };
    owned.completion = task
      .catch((cause: unknown) => {
        options.reportFailure(cause);
        return [];
      })
      .then((results) => {
        tasks.delete(owned);
        return results;
      });
    tasks.add(owned);
    return owned.completion;
  }

  function flush(): Promise<readonly TResult[]> {
    if (pending === undefined) return Promise.resolve([]);
    pending.controller.abort();
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
    candidate?.controller.abort();
  }
}
