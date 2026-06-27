import { diagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import { editPromptBufferForEvent, isMultilineText } from './buffer-edit.ts';
import type { PromptInteractionHooks } from './interaction-hooks.ts';
import { createPromptSnapshot, promptValueForSnapshot } from './snapshot.ts';
import { completePromptState, type PromptRuntimeState } from './state.ts';
import { promptValueView } from './value-view.ts';
import type { PromptDefinition, PromptResult } from './types.ts';
import { validatePromptValue } from './validation.ts';

export async function applyTextPromptEvent(
  prompt: PromptDefinition<string>,
  host: TerminalHost,
  state: PromptRuntimeState,
  event: InputEvent,
  hooks: PromptInteractionHooks
): Promise<PromptResult<string> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    return hooks.submit(prompt, state.buffer.text, host, state);
  }
  if (event.kind === 'paste' && isMultilineText(event.text)) return multilinePasteFailure(prompt, state);
  if (!editPromptBufferForEvent(state, event)) return undefined;
  scheduleTextValidation(prompt, host, state, hooks);
  await hooks.render(host, prompt, state);
  return undefined;
}

export function scheduleInitialValidation<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState,
  hooks: PromptInteractionHooks
): void {
  if (prompt.kind !== 'input' && prompt.kind !== 'password') return;
  scheduleTextValidation(promptValueView(prompt), host, state, hooks);
}

function scheduleTextValidation(
  prompt: PromptDefinition<string>,
  host: TerminalHost,
  state: PromptRuntimeState,
  hooks: PromptInteractionHooks
): void {
  if (prompt.validate === undefined && prompt.required !== true) {
    clearValidationState(state);
    return;
  }
  state.validationController?.abort();
  const controller = new AbortController();
  state.validationController = controller;
  state.validationStatus = 'running';
  delete state.validationDiagnostic;
  const version = state.validationVersion + 1;
  state.validationVersion = version;
  const value = state.buffer.text;
  void (async () => {
    const validation = await validatePromptValue({
      prompt,
      value,
      host,
      signal: controller.signal
    });
    if (controller.signal.aborted || state.completed || version !== state.validationVersion) return;
    if (validation.ok) {
      state.validationStatus = 'valid';
      delete state.validationDiagnostic;
    } else {
      state.validationStatus = 'invalid';
      state.validationDiagnostic = validation.diagnostic;
    }
    await hooks.render(host, prompt, state);
  })();
}

function clearValidationState(state: PromptRuntimeState): void {
  state.validationController?.abort();
  state.validationStatus = 'idle';
  delete state.validationDiagnostic;
}

function multilinePasteFailure(
  prompt: PromptDefinition<string>,
  state: PromptRuntimeState
): PromptResult<string> {
  completePromptState(state);
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'validation_failed',
    diagnostics: [
      diagnostic(
        'PROMPT_VALIDATION_FAILED',
        'Multiline paste is not accepted by single-line prompts. Use editor() for multiline input.'
      )
    ],
    snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
  };
}
