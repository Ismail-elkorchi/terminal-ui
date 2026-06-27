import type { PromptDefinition, PromptResult } from './types.ts';

export function promptValueView<TTarget, TSource>(
  prompt: PromptDefinition<TSource>
): PromptDefinition<TTarget> {
  const value: unknown = prompt;
  return value as PromptDefinition<TTarget>;
}

export function promptResultValueView<TTarget>(
  result: PromptResult<unknown>
): PromptResult<TTarget> {
  const value: unknown = result;
  return value as PromptResult<TTarget>;
}
