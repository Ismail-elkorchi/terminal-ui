import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { PromptAbortResult, PromptDefinition, PromptSubmitResult } from './types.ts';
import { validatePromptValue } from './validation.ts';

export async function submitPrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  value: TValue,
  snapshot: AccessibleSnapshot,
  host?: TerminalHost
): Promise<PromptSubmitResult<TValue> | PromptAbortResult> {
  const validation = await validatePromptValue({ prompt, value, ...(host === undefined ? {} : { host }) });
  if (!validation.ok) return validationFailure(snapshot, validation.diagnostic);
  return { schemaVersion: 'terminal-ui.prompt-result.v1', status: 'submitted', value, diagnostics: [], snapshot };
}

function validationFailure(
  snapshot: AccessibleSnapshot,
  validationDiagnostic: TerminalDiagnostic
): PromptAbortResult {
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'validation_failed',
    diagnostics: [validationDiagnostic],
    snapshot
  };
}
