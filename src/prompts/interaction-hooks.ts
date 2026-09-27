import type { TerminalHost } from '../host/types.ts';
import type { PromptTaskOwner } from './session.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptDefinition, PromptResult, PromptValueContract } from './types.ts';

export interface PromptRenderHook<TChoice, TPrompt extends PromptDefinition<TChoice>> {
  readonly owner: PromptTaskOwner;
  render(
    host: TerminalHost,
    prompt: TPrompt,
    state: PromptRuntimeState<TChoice>
  ): Promise<void>;
}

export interface PromptInteractionHooks<
  TChoice,
  TPrompt extends PromptDefinition<TChoice> & PromptValueContract<TValue>,
  TValue
> extends PromptRenderHook<TChoice, TPrompt> {
  submit(
    prompt: TPrompt,
    value: TValue,
    host: TerminalHost,
    state: PromptRuntimeState<TChoice>
  ): Promise<PromptResult<TValue>>;
}
