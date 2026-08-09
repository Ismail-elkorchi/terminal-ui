import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalRestoreReason, TerminalSession } from '../host/index.ts';
import type { PromptResult } from './types.ts';

export interface PromptSessionSetup {
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly bracketedPaste: boolean;
}

export async function setupPromptSession(session: TerminalSession): Promise<PromptSessionSetup> {
  const diagnostics: TerminalDiagnostic[] = [];
  const rawInput = await session.enableRawInput();
  const bracketedPaste = await session.enableBracketedPaste();
  for (const result of [rawInput, bracketedPaste]) {
    if (result.status === 'applied') diagnostics.push(...result.diagnostics);
    else diagnostics.push(result.diagnostic, ...result.diagnostics);
  }
  return {
    diagnostics,
    bracketedPaste: bracketedPaste.status === 'applied'
  };
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
