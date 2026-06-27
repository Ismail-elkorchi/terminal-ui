import type { NonTtyMode, PromptDefinition } from './types.ts';

export function nonTtyMode<TValue>(prompt: PromptDefinition<TValue>): NonTtyMode {
  return prompt.nonTty?.mode ?? (prompt.kind === 'input' ? 'line_fallback' : 'reject');
}

export function hasProvidedNonTtyValue<TValue>(
  prompt: PromptDefinition<TValue>
): prompt is PromptDefinition<TValue> & { readonly nonTty: { readonly mode: 'provided_value'; readonly value: TValue } } {
  return prompt.nonTty?.mode === 'provided_value' && 'value' in prompt.nonTty;
}

export function canSubmitDefaultInNonTty<TValue>(
  prompt: PromptDefinition<TValue>
): prompt is PromptDefinition<TValue> & { readonly defaultValue: TValue } {
  if (prompt.defaultValue === undefined || prompt.nonTty?.mode === 'reject') return false;
  return prompt.kind === 'input'
    || prompt.kind === 'password'
    || prompt.kind === 'confirm';
}

export function nonTtyDiagnosticOptions<TValue>(
  prompt: PromptDefinition<TValue>
): { readonly hint?: string } {
  return prompt.nonTty?.diagnosticHint === undefined ? {} : { hint: prompt.nonTty.diagnosticHint };
}
