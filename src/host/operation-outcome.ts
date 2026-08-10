import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalOperationOutcome, TerminalStateChange } from './types.ts';

export function terminalOperationApplied(
  change: TerminalStateChange,
  assurance: Extract<TerminalOperationOutcome, { readonly status: 'applied' }>['assurance'],
  diagnostics: readonly TerminalDiagnostic[] = []
): TerminalOperationOutcome {
  return { status: 'applied', assurance, change, diagnostics };
}

export function terminalOperationRejected(
  diagnostic: TerminalDiagnostic,
  diagnostics: readonly TerminalDiagnostic[] = []
): TerminalOperationOutcome {
  return { status: 'rejected', diagnostic, diagnostics };
}

export function terminalOperationIndeterminate(
  attempted: TerminalStateChange,
  diagnostic: TerminalDiagnostic,
  diagnostics: readonly TerminalDiagnostic[] = []
): TerminalOperationOutcome {
  return { status: 'indeterminate', attempted, diagnostic, diagnostics };
}
