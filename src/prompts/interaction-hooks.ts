import type { TerminalHost } from '../host/index.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptDefinition, PromptResult } from './types.ts';

export interface PromptInteractionHooks {
  render<TValue>(
    host: TerminalHost,
    prompt: PromptDefinition<TValue>,
    state: PromptRuntimeState
  ): Promise<void>;
  submit<TValue>(
    prompt: PromptDefinition<TValue>,
    value: TValue,
    host: TerminalHost,
    state: PromptRuntimeState
  ): Promise<PromptResult<TValue>>;
}
