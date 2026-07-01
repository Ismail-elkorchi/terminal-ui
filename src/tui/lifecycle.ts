import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic } from '../diagnostics.ts';
import { applySessionProtocolPolicy } from './session-policy.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalRestoreReason, TerminalSession } from '../host/index.ts';
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
  policy?: SessionProtocolPolicy
): Promise<SessionProtocolSetupResult> {
  return applySessionProtocolPolicy(session, policy);
}

export async function restoreTuiSession(
  session: TerminalSession,
  reason: TerminalRestoreReason
): Promise<readonly TerminalDiagnostic[]> {
  try {
    const result = await session.restore(reason);
    return result.diagnostics;
  } catch (cause) {
    return [diagnostic('HOST_RESTORE_FAILED', 'Terminal session restore failed.', { cause, target: session.id })];
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
  diagnostics: readonly TerminalDiagnostic[]
): TuiExit<TState> {
  if (diagnostics.length === 0) return exit;
  return { ...exit, diagnostics: [...exit.diagnostics, ...diagnostics] };
}
