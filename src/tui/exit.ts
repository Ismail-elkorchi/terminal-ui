import { sanitizeTerminalText } from '../text/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { Frame } from './frame.ts';
import type { TuiExit } from './types.ts';

export function completedExit<TState>(state: TState, frame: Frame, reason?: string): TuiExit<TState> {
  return completedExitFromSnapshot(state, frame.accessibility, reason);
}

export function completedExitFromSnapshot<TState>(
  state: TState,
  snapshot: AccessibleSnapshot,
  reason?: string
): TuiExit<TState> {
  return {
    status: 'completed',
    state,
    ...(reason === undefined ? {} : { reason: sanitizeTerminalText(reason).text }),
    diagnostics: [],
    snapshot
  };
}

export function exitWithStatus<TState>(
  status: 'cancelled' | 'interrupted',
  state: TState,
  frame: Frame
): TuiExit<TState> {
  return {
    status,
    state,
    diagnostics: [],
    snapshot: frame.accessibility
  };
}
