import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalRestoreReason, TerminalSession } from '../host/index.ts';
import type { PromptResult } from './types.ts';

export async function setupPromptSession(session: TerminalSession): Promise<readonly TerminalDiagnostic[]> {
  const diagnostics: TerminalDiagnostic[] = [];
  for (const result of [
    await session.enableRawInput(),
    await session.enableBracketedPaste()
  ]) {
    if (result.ok) diagnostics.push(...(result.diagnostics ?? []));
    else diagnostics.push(result.error, ...(result.diagnostics ?? []));
  }
  return diagnostics;
}

export function restoreReasonForPrompt(result: PromptResult<unknown>): TerminalRestoreReason {
  if (result.status === 'submitted') return 'success';
  switch (result.reason) {
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    case 'timeout':
      return 'timeout';
    case 'validation_failed':
    case 'host_error':
    case 'non_tty_denied':
      return 'error';
  }
}
