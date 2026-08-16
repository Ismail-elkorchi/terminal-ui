import type { TerminalClock } from '../host/index.ts';

export interface InputAmbiguityDeadline<TResult> {
  schedule(operation: () => Promise<TResult>): Promise<TResult | undefined>;
  cancel(): void;
}

export function createInputAmbiguityDeadline<TResult>(
  clock: TerminalClock,
  delayMs: number
): InputAmbiguityDeadline<TResult> {
  let active: AbortController | undefined;

  return {
    schedule(operation) {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return clock.sleep(delayMs, controller.signal).then(
        async (outcome) => {
          if (outcome === 'aborted' || active !== controller) return undefined;
          active = undefined;
          return operation();
        },
        (cause: unknown) => {
          if (controller.signal.aborted) return undefined;
          active = undefined;
          throw cause;
        }
      );
    },
    cancel() {
      active?.abort();
      active = undefined;
    }
  };
}
