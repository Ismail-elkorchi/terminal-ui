import type { TerminalDiagnostic } from './diagnostics.ts';

export type Result<TValue, TError = TerminalDiagnostic> =
  | { readonly status: 'success'; readonly value: TValue; readonly diagnostics?: readonly TerminalDiagnostic[] }
  | { readonly status: 'failure'; readonly error: TError; readonly diagnostics?: readonly TerminalDiagnostic[] };

export function success<TValue>(
  value: TValue,
  diagnostics?: readonly TerminalDiagnostic[]
): Result<TValue> {
  return diagnostics === undefined
    ? { status: 'success', value }
    : { status: 'success', value, diagnostics };
}

export function failure<TError = TerminalDiagnostic>(
  error: TError,
  diagnostics?: readonly TerminalDiagnostic[]
): Result<never, TError> {
  return diagnostics === undefined
    ? { status: 'failure', error }
    : { status: 'failure', error, diagnostics };
}
