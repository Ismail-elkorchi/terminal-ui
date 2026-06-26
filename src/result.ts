import type { TerminalDiagnostic } from './diagnostics.ts';

export type Result<TValue, TError = TerminalDiagnostic> =
  | { readonly ok: true; readonly value: TValue; readonly diagnostics?: readonly TerminalDiagnostic[] }
  | { readonly ok: false; readonly error: TError; readonly diagnostics?: readonly TerminalDiagnostic[] };

export function ok<TValue>(
  value: TValue,
  diagnostics?: readonly TerminalDiagnostic[]
): Result<TValue> {
  return diagnostics === undefined ? { ok: true, value } : { ok: true, value, diagnostics };
}

export function err<TError = TerminalDiagnostic>(
  error: TError,
  diagnostics?: readonly TerminalDiagnostic[]
): Result<never, TError> {
  return diagnostics === undefined ? { ok: false, error } : { ok: false, error, diagnostics };
}
