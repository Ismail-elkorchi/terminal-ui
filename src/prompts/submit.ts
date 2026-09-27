import type { AccessibleSnapshot } from '../accessibility/types.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/types.ts';
import type { PromptAbortResult, PromptSubmitResult, PromptValueContract } from './types.ts';
import { validatePromptValue } from './validation.ts';

export async function submitPrompt<TValue>(
  prompt: PromptValueContract<TValue>,
  value: TValue,
  snapshot: AccessibleSnapshot,
  host?: TerminalHost
): Promise<PromptSubmitResult<TValue> | PromptAbortResult> {
  const validation = await validatePromptValue({ prompt, value, ...(host === undefined ? {} : { host }) });
  if (validation.status === 'invalid') return validationFailure(snapshot, validation.diagnostic);
  return { status: 'submitted', value, diagnostics: [], snapshot };
}

function validationFailure(
  snapshot: AccessibleSnapshot,
  validationDiagnostic: TerminalDiagnostic
): PromptAbortResult {
  return {
    status: 'aborted',
    reason: 'validation_failed',
    diagnostics: [validationDiagnostic],
    snapshot
  };
}
