import { createProtocolWriter } from '../../protocol/index.ts';
import { requireCommittedTerminalWrite } from '../../host/write-receipt.ts';
import { createAccessibleSnapshot } from '../../accessibility/snapshot.ts';
import type { AccessibleSnapshot } from '../../accessibility/types.ts';
import type { DiagnosticOccurrence } from '../../diagnostics.ts';
import { diagnostic } from '../../diagnostics.ts';
import type {
  TerminalOperationContext,
  TerminalRestoreOptions,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
} from '../../host/types.ts';
import type { SessionProtocolPolicy, SessionProtocolSetupResult } from './session-policy.ts';
import { applySessionProtocolPolicy } from './session-policy.ts';
import type { TuiExit } from '../types.ts';
export {
  applySessionProtocolPolicy,
  createSessionProtocolPlan,
  defaultSessionProtocolPolicy,
} from './session-policy.ts';
export type {
  CursorVisibilityPolicy,
  ProtocolRequirement,
  SessionProtocolOperation,
  SessionProtocolOperationKind,
  SessionProtocolPolicy,
  SessionProtocolSetupResult,
} from './session-policy.ts';

export function tuiSnapshot(id: string): AccessibleSnapshot {
  return createAccessibleSnapshot({
    source: 'tui',
    root: { id, role: 'application', label: 'Terminal application' }
  });
}

export async function setupTuiSession(
  session: TerminalSession,
  policy?: SessionProtocolPolicy,
  context: TerminalOperationContext = {}
): Promise<SessionProtocolSetupResult> {
  const setup = await applySessionProtocolPolicy(session, policy, context);
  if (setup.status !== 'ready' || setup.policy.cellPresentation === 'disabled') return setup;
  if (setup.resultingState.cellPresentation !== 'explicit') {
    throw new Error('A visual-cell surface requires established explicit cell presentation.');
  }
  // Ordering modes can be captured on paragraph creation. Replacing characters
  // with spaces does not establish fresh paragraph attributes on an existing grid.
  // This is full-surface TUI acquisition, shared by startup and resume; the host
  // mode operation itself never clears caller content and partial diffs stay local.
  await createProtocolWriter({ write: async text => {
    requireCommittedTerminalWrite(await session.host.write({ text }, context));
  } }).clearScreen();
  return setup;
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
    const provenance = Object.freeze({
      rawInput: 'indeterminate' as const,
      alternateScreen: 'indeterminate' as const,
      bracketedPaste: 'indeterminate' as const,
      mouseReporting: 'indeterminate' as const,
      focusReporting: 'indeterminate' as const,
      metaSendsEscape: 'indeterminate' as const,
      unicodeGraphemeMode: 'indeterminate' as const,
      cellPresentation: 'indeterminate' as const,
      keyboardProfile: 'indeterminate' as const,
      cursorVisible: 'indeterminate' as const
    });
    return Object.freeze({
      status: 'failed',
      reason,
      requested: session.initialState,
      attempted: Object.freeze([]),
      completed: Object.freeze([]),
      resultingState: Object.freeze({
        ...session.initialState,
        provenance
      }),
      diagnostics: Object.freeze([failure])
    });
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
