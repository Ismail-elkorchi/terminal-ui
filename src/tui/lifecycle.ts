import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic } from '../diagnostics.ts';
import { applySessionProtocolPolicy } from './session-policy.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type {
  TerminalOperationContext,
  TerminalRestoreOptions,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession
} from '../host/index.ts';
import type { TuiExit } from './types.ts';
import type { SessionProtocolPolicy, SessionProtocolSetupResult } from './session-policy.ts';
export { applySessionProtocolPolicy, createSessionProtocolPlan, defaultSessionProtocolPolicy } from './session-policy.ts';
export type {
  CursorVisibilityPolicy,
  ProtocolRequirement,
  SessionProtocolOperation,
  SessionProtocolOperationKind,
  SessionProtocolPolicy,
  SessionProtocolSetupResult
} from './session-policy.ts';

export function tuiSnapshot(id: string): AccessibleSnapshot {
  return toAccessibleSnapshot({
    source: 'tui',
    root: { id, role: 'application', label: id }
  });
}

export async function setupTuiSession(
  session: TerminalSession,
  policy?: SessionProtocolPolicy,
  context: TerminalOperationContext = {}
): Promise<SessionProtocolSetupResult> {
  return applySessionProtocolPolicy(session, policy, context);
}

export async function restoreTuiSession(
  session: TerminalSession,
  reason: TerminalRestoreReason,
  options: TerminalRestoreOptions = {}
): Promise<TerminalRestoreResult> {
  try {
    return await session.restore(reason, options);
  } catch (cause) {
    const failure = diagnostic('HOST_RESTORE_FAILED', 'Terminal session restore failed.', { cause, target: session.id });
    return {
      status: 'failed',
      reason,
      requested: session.initialState,
      attempted: [],
      confirmed: [],
      resultingState: {
        ...session.initialState,
        provenance: {
          rawInput: 'indeterminate',
          alternateScreen: 'indeterminate',
          bracketedPaste: 'indeterminate',
          mouseReporting: 'indeterminate',
          focusReporting: 'indeterminate',
          unicodeGraphemeMode: 'indeterminate',
          keyboardProfile: 'indeterminate',
          cursorVisible: 'indeterminate'
        }
      },
      diagnostics: [failure]
    };
  }
}

export function restoreReasonForExit(status: TuiExit<unknown>['status']): TerminalRestoreReason {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    case 'error':
      return 'error';
  }
}

export function withDiagnostics<TState>(
  exit: TuiExit<TState>,
  diagnostics: readonly DiagnosticOccurrence[]
): TuiExit<TState> {
  if (diagnostics.length === 0) return exit;
  return { ...exit, diagnostics: [...exit.diagnostics, ...diagnostics] };
}
