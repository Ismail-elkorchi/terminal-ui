import type { TerminalSleepOutcome } from './types.ts';

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<TerminalSleepOutcome> {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError('ms must be a finite non-negative number.');
  }
  if (signal?.aborted === true) return Promise.resolve('aborted');
  if (ms === 0) return Promise.resolve('elapsed');

  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: TerminalSleepOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => { settle('aborted'); };
    const timeout = setTimeout(() => { settle('elapsed'); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
