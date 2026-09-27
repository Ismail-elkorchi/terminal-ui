import type { TerminalDiagnostic } from '../../diagnostics.ts';
import { diagnostic } from '../../diagnostics.ts';
import type { TerminalCapabilityName } from '../capability-types.ts';
import { terminalOperationRejected } from '../operation-outcome.ts';
import type { TerminalModeReports, TerminalModeReportState } from '../terminal-mode-query.ts';
import type {
  TerminalOperationContext,
  TerminalOperationOutcome,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalStateChange,
  TerminalStateKnowledge,
  TerminalStateSnapshot,
} from '../types.ts';
import type { TerminalStateKey } from './contracts.ts';
import { freezeTerminalStateChange } from './snapshot.ts';
type TerminalLeaseSnapshot = Pick<TerminalSession, 'id' | 'capabilities' | 'initialState'>;

export function unavailableCapabilityOutcome(
  lease: TerminalLeaseSnapshot,
  kind: TerminalCapabilityName
): TerminalOperationOutcome | undefined {
  const capability = lease.capabilities[kind];
  if (capability.support === 'supported' && capability.availability === 'available') return undefined;
  return terminalOperationRejected(diagnostic(
    'HOST_PROTOCOL_UNSUPPORTED',
    `Terminal protocol is unavailable: ${kind}.`,
    {
      severity: 'warning',
      target: lease.id,
      data: {
        capability: kind,
        support: capability.support,
        availability: capability.availability,
        diagnostics: capability.diagnostics.map((item) => item.message)
      }
    }
  ));
}

export function permanentModeTransitionDiagnostic(
  lease: TerminalLeaseSnapshot,
  change: TerminalStateChange,
  reports: TerminalModeReports
): TerminalDiagnostic | undefined {
  const requestedModes = requestedPrivateModes(change);
  for (const [mode, requested] of requestedModes) {
    const fixed = permanentModeValue(reports[mode]);
    if (fixed === undefined || fixed === requested) continue;
    return diagnostic(
      'HOST_PROTOCOL_UNSUPPORTED',
      `Terminal mode ${String(mode)} is permanent and cannot reach the requested ${change.kind} state.`,
      {
        severity: 'warning',
        target: lease.id,
        data: { operation: change.kind, mode, fixed, requested }
      }
    );
  }
  return undefined;
}

function requestedPrivateModes(
  change: TerminalStateChange
): readonly (readonly [keyof TerminalModeReports, boolean])[] {
  switch (change.kind) {
    case 'alternateScreen': return [[1049, change.state]];
    case 'bracketedPaste': return [[2004, change.state]];
    case 'cursorVisible': return [[25, change.state]];
    case 'focusReporting': return [[1004, change.state]];
    case 'metaSendsEscape': return [[1036, change.state]];
    case 'unicodeGraphemeMode': return [[2027, change.state]];
    case 'mouseReporting': {
      const mouse = change.state;
      return [
        [1000, mouse.tracking === 'click'],
        [1002, mouse.tracking === 'drag'],
        [1003, mouse.tracking === 'all'],
        [1006, mouse.encoding === 'sgr']
      ];
    }
    case 'rawInput':
    case 'keyboardProfile':
      return [];
  }
}

function permanentModeValue(report: TerminalModeReportState | undefined): boolean | undefined {
  if (report === 'permanently_set') return true;
  if (report === 'permanently_reset') return false;
  return undefined;
}

export function assuranceForKnowledge(
  knowledge: TerminalStateKnowledge
): Extract<TerminalOperationOutcome, { readonly status: 'applied' }>['assurance'] {
  if (knowledge === 'observed') return 'observed';
  if (knowledge === 'library_known') return 'sent';
  return 'assumed';
}

export function capabilityForState(kind: TerminalStateKey): TerminalCapabilityName {
  switch (kind) {
    case 'rawInput': return 'rawInput';
    case 'alternateScreen': return 'alternateScreen';
    case 'bracketedPaste': return 'bracketedPaste';
    case 'mouseReporting': return 'mouseReporting';
    case 'focusReporting': return 'focusReporting';
    case 'metaSendsEscape': return 'metaSendsEscape';
    case 'unicodeGraphemeMode': return 'unicodeGraphemeMode';
    case 'keyboardProfile': return 'keyboardProtocol';
    case 'cursorVisible': return 'cursorVisibility';
  }
}

export function cancelledOperationDiagnostic(
  lease: TerminalLeaseSnapshot,
  context: TerminalOperationContext
): TerminalDiagnostic | undefined {
  if (context.signal?.aborted !== true) return undefined;
  return diagnostic('HOST_OPERATION_CANCELLED', 'Terminal operation was cancelled before it started.', {
    severity: 'warning',
    target: lease.id
  });
}

export function indeterminateOperationDiagnostic(
  lease: TerminalLeaseSnapshot,
  change: TerminalStateChange,
  cause: unknown
): TerminalDiagnostic {
  return diagnostic('HOST_OUTPUT_INDETERMINATE', `Terminal operation outcome is indeterminate: ${change.kind}.`, {
    severity: 'error',
    target: lease.id,
    cause,
    data: { operation: change.kind }
  });
}

export function supersededOperationDiagnostic(
  lease: TerminalLeaseSnapshot,
  change: TerminalStateChange
): TerminalDiagnostic {
  return indeterminateOperationDiagnostic(
    lease,
    change,
    new Error('Terminal operation was superseded by emergency recovery.')
  );
}

export function rawInputObservationMismatchDiagnostic(
  lease: TerminalLeaseSnapshot,
  observed: boolean
): TerminalDiagnostic {
  return diagnostic(
    'HOST_PROTOCOL_UNSUPPORTED',
    'The terminal input adapter did not reach the requested raw-input state.',
    {
      severity: 'error',
      target: lease.id,
      data: { operation: 'rawInput', observed }
    }
  );
}

export function failedRestore(
  requested: TerminalStateSnapshot,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot,
  diagnostics: readonly TerminalDiagnostic[]
): TerminalRestoreResult {
  return { status: 'failed', reason, requested, attempted: [], completed: [], resultingState, diagnostics };
}

export function supersededRestore(
  lease: TerminalLeaseSnapshot,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot
): TerminalRestoreResult {
  return failedRestore(lease.initialState, reason, resultingState, [
    supersededRestoreDiagnostic(lease)
  ]);
}

export function supersededRestoreDiagnostic(
  lease: TerminalLeaseSnapshot,
  operation?: TerminalStateKey,
  cause?: unknown
): TerminalDiagnostic {
  return diagnostic('HOST_RESTORE_FAILED', operation === undefined
    ? 'Terminal restoration was superseded by emergency recovery.'
    : `Terminal restoration was superseded while restoring terminal state: ${operation}.`, {
    severity: 'error',
    target: lease.id,
    ...(cause === undefined ? {} : { cause }),
    data: {
      superseded: true,
      ...(operation === undefined ? {} : { operation })
    }
  });
}

export function cancelledRestore(
  lease: TerminalLeaseSnapshot,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot,
  signal: AbortSignal
): TerminalRestoreResult {
  return failedRestore(lease.initialState, reason, resultingState, [
    restoreCancellationDiagnostic(lease, signal)
  ]);
}

export function restoreCancellationDiagnostic(
  lease: TerminalLeaseSnapshot,
  signal: AbortSignal,
  operation?: TerminalStateKey,
  cause: unknown = signal.reason
): TerminalDiagnostic {
  return diagnostic('HOST_RESTORE_FAILED', operation === undefined
    ? 'Terminal restoration was not started because finalization had expired.'
    : `Terminal restoration expired while restoring terminal state: ${operation}.`, {
    severity: 'error',
    target: lease.id,
    cause,
    data: {
      cancelled: true,
      ...(operation === undefined ? {} : { operation })
    }
  });
}

export function restoreWasCancelled(context: TerminalOperationContext): context is { readonly signal: AbortSignal } {
  return context.signal?.aborted === true;
}

export function aggregateRestoreResults(
  results: readonly TerminalRestoreResult[],
  reason: TerminalRestoreReason
): TerminalRestoreResult {
  const first = results[0];
  const last = results.at(-1);
  if (first === undefined || last === undefined) throw new Error('Terminal restore aggregation invariant failed.');
  const diagnostics = results.flatMap((item) => item.diagnostics);
  const completed = results.flatMap((item) => item.completed);
  return freezeRestoreResult({
    status: diagnostics.length === 0 ? 'restored' : completed.length === 0 ? 'failed' : 'partial',
    reason,
    requested: last.requested,
    attempted: results.flatMap((item) => item.attempted),
    completed,
    resultingState: last.resultingState,
    diagnostics
  });
}

export function freezeRestoreResult(result: TerminalRestoreResult): TerminalRestoreResult {
  return Object.freeze({
    ...result,
    attempted: Object.freeze(result.attempted.map(freezeTerminalStateChange)),
    completed: Object.freeze(result.completed.map((item) => Object.freeze({
      ...freezeTerminalStateChange(item),
      assurance: item.assurance
    }))),
    diagnostics: Object.freeze([...result.diagnostics])
  });
}
