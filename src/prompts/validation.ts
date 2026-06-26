import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { PromptDefinition } from './types.ts';

export type PromptValidationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostic: TerminalDiagnostic };

export interface PromptValidationRequest<TValue> {
  readonly prompt: PromptDefinition<TValue>;
  readonly value: TValue;
  readonly host?: TerminalHost;
  readonly signal?: AbortSignal;
}

export async function validatePromptValue<TValue>(
  request: PromptValidationRequest<TValue>
): Promise<PromptValidationOutcome> {
  const { prompt, value, host, signal } = request;
  if (prompt.required === true && isEmptyRequiredValue(value)) {
    return {
      ok: false,
      diagnostic: diagnostic('PROMPT_VALIDATION_FAILED', 'Prompt value is required.', {
        data: { validationCode: 'required' }
      })
    };
  }
  try {
    const validation = await prompt.validate?.(value, {
      ...(host === undefined ? {} : { host }),
      ...(signal === undefined ? {} : { signal })
    });
    if (validation !== undefined && !validation.ok) {
      return {
        ok: false,
        diagnostic: diagnostic(
          'PROMPT_VALIDATION_FAILED',
          redactPromptSecret(prompt, value, validation.message),
          validation.code === undefined
            ? {}
            : { data: { validationCode: redactPromptSecret(prompt, value, validation.code) } }
        )
      };
    }
  } catch {
    return {
      ok: false,
      diagnostic: diagnostic('PROMPT_VALIDATION_FAILED', 'Prompt validation failed before submission.')
    };
  }
  return { ok: true };
}

function isEmptyRequiredValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function redactPromptSecret<TValue>(
  prompt: PromptDefinition<TValue>,
  value: TValue,
  text: string
): string {
  if (prompt.kind !== 'password' || typeof value !== 'string' || value.length === 0) return text;
  return text.split(value).join('[redacted]');
}
