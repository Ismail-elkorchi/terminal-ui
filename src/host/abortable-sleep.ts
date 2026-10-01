import { clearImmediate, setImmediate } from 'node:timers';
import type { TerminalSleepOutcome } from './types.ts';

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<TerminalSleepOutcome> {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError('ms must be a finite non-negative number.');
  }
  if (signal?.aborted === true) return Promise.resolve('aborted');

  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: TerminalSleepOutcome): void => {
      if (settled) return;
      settled = true;
      if (immediate !== undefined) clearImmediate(immediate);
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => { settle('aborted'); };
    // Zero is the native cooperative-yield path, not a clamped one-ms timer.
    const immediate = ms === 0 ? setImmediate(() => { settle('elapsed'); }) : undefined;
    const timeout = ms === 0 ? undefined : setTimeout(() => { settle('elapsed'); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
