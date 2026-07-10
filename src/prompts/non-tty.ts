import type { NonTtyMode, PromptDefinition } from './types.ts';

export function nonTtyMode<TChoice>(prompt: PromptDefinition<TChoice>): NonTtyMode {
  return prompt.nonTty?.mode ?? (prompt.kind === 'input' ? 'line_fallback' : 'reject');
}

export function nonTtyDiagnosticOptions<TChoice>(
  prompt: PromptDefinition<TChoice>
): { readonly hint?: string } {
  return prompt.nonTty?.diagnosticHint === undefined ? {} : { hint: prompt.nonTty.diagnosticHint };
}
