import type { CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import type { TuiEffectContext } from './types.ts';

/** Use the runtime's injected clock and cancellation for prepared collection/text work. */
export function createTuiCooperativeWorkContext(
  context: Pick<TuiEffectContext, 'signal' | 'clock'>,
): CooperativeWorkContext {
  const { signal, clock } = context;
  return Object.freeze({
    signal,
    monotonicNow: () => clock.monotonicNow(),
    yield: async () => {
      signal.throwIfAborted();
      await clock.sleep(0, signal);
      signal.throwIfAborted();
    },
  });
}
