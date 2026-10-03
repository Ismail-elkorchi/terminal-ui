import { TerminalUiError } from '../../errors.ts';
import type { TuiRuntimePolicy } from '../types.ts';

export const defaultTuiRuntimePolicy: TuiRuntimePolicy = Object.freeze({
  maxPendingOperations: 256,
  maxMessagesPerTransaction: 1_024,
  maxContributionsPerTransaction: 1_024,
  maxOwnedSources: 64,
  maxSourceCapacity: 4_096,
  maxContinuationMessages: 1_024,
  maxContinuationTurns: 64,
});

export function resolveTuiRuntimePolicy(input: unknown = {}): TuiRuntimePolicy {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('TUI runtime policy must be an object.');
  const result = { ...defaultTuiRuntimePolicy, ...input };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`TUI runtime policy ${name} must be a positive safe integer.`);
    }
  }
  return Object.freeze(result);
}

export function assertRuntimeLimit(reason: string, observed: number, limit: number): void {
  if (observed <= limit) return;
  throw new TerminalUiError(`TUI ${reason} limit exceeded.`, { code: 'TUI_OVERLOAD', reason, observed, limit });
}
