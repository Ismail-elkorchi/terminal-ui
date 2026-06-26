import { diagnostic } from '../diagnostics.ts';
import { filterStaticChoices, firstEnabledChoiceIndex } from './choices.ts';
import { setChoiceTotal } from './state.ts';
import type { TerminalHost } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { PromptInteractionHooks } from './interaction-hooks.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptChoice, PromptDefinition } from './types.ts';

export function scheduleAutocompleteChoiceRefresh<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState,
  hooks: PromptInteractionHooks
): void {
  state.choiceDebounceController?.abort();
  const delayMs = Math.max(0, prompt.debounceMs ?? 0);
  if (delayMs === 0) {
    void refreshAutocompleteChoices(prompt, host, state, hooks);
    return;
  }
  const controller = new AbortController();
  state.choiceDebounceController = controller;
  void (async () => {
    await host.clock.sleep(delayMs, controller.signal);
    if (controller.signal.aborted || state.completed || state.choiceDebounceController !== controller) return;
    await refreshAutocompleteChoices(prompt, host, state, hooks);
  })();
}

export async function maybeLoadNextChoicePage<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState,
  event: InputEvent,
  hooks: PromptInteractionHooks
): Promise<boolean> {
  if (event.kind !== 'key' || event.key !== 'pageDown') return false;
  if (typeof prompt.choices !== 'function' || !state.choiceHasMore || state.choiceLoading) return true;
  state.choiceController?.abort();
  const controller = new AbortController();
  state.choiceController = controller;
  state.choiceLoading = true;
  state.choiceDiagnostics = [];
  const version = state.choiceLoadVersion + 1;
  state.choiceLoadVersion = version;
  const previousLength = state.choices.length;
  await hooks.render(host, prompt, state);
  try {
    const result = await prompt.choices({
      query: prompt.kind === 'autocomplete' ? state.buffer.text : '',
      offset: state.choices.length,
      limit: 50,
      signal: controller.signal
    });
    if (controller.signal.aborted || state.completed || version !== state.choiceLoadVersion) return true;
    state.choices = [...state.choices, ...result.choices];
    state.choiceDiagnostics = result.diagnostics ?? [];
    state.choiceHasMore = result.hasMore ?? false;
    setChoiceTotal(state, result.total);
    state.focusedChoiceIndex = firstEnabledChoiceIndexFrom(state.choices, previousLength)
      ?? firstEnabledChoiceIndex(state.choices)
      ?? 0;
  } catch (cause) {
    if (controller.signal.aborted || state.completed || version !== state.choiceLoadVersion) return true;
    state.choiceDiagnostics = [
      diagnostic('PROMPT_DATA_SOURCE_FAILED', 'Prompt choice page failed.', {
        cause,
        target: prompt.id ?? prompt.kind
      })
    ];
  } finally {
    if (!controller.signal.aborted && !state.completed && version === state.choiceLoadVersion) {
      state.choiceLoading = false;
      await hooks.render(host, prompt, state);
    }
  }
  return true;
}

async function refreshAutocompleteChoices<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState,
  hooks: PromptInteractionHooks
): Promise<void> {
  if (typeof prompt.choices !== 'function') {
    state.choices = filterStaticChoices(prompt.choices ?? [], state.buffer.text);
    state.choiceDiagnostics = [];
    state.choiceHasMore = false;
    setChoiceTotal(state, undefined);
    state.focusedChoiceIndex = firstEnabledChoiceIndex(state.choices) ?? 0;
    await hooks.render(host, prompt, state);
    return;
  }
  state.choiceController?.abort();
  const controller = new AbortController();
  state.choiceController = controller;
  state.choiceLoading = true;
  state.choiceDiagnostics = [];
  state.choiceHasMore = false;
  const version = state.choiceLoadVersion + 1;
  state.choiceLoadVersion = version;
  try {
    const result = await prompt.choices({
      query: state.buffer.text,
      offset: 0,
      limit: 50,
      signal: controller.signal
    });
    if (controller.signal.aborted || state.completed || version !== state.choiceLoadVersion) return;
    state.choices = result.choices;
    state.choiceDiagnostics = result.diagnostics ?? [];
    state.choiceHasMore = result.hasMore ?? false;
    setChoiceTotal(state, result.total);
    state.focusedChoiceIndex = firstEnabledChoiceIndex(state.choices) ?? 0;
  } catch (cause) {
    if (controller.signal.aborted || state.completed || version !== state.choiceLoadVersion) return;
    state.choices = [];
    state.choiceDiagnostics = [
      diagnostic('PROMPT_DATA_SOURCE_FAILED', 'Autocomplete data source failed.', {
        cause,
        target: prompt.id ?? prompt.kind
      })
    ];
    state.choiceHasMore = false;
  } finally {
    if (!controller.signal.aborted && !state.completed && version === state.choiceLoadVersion) {
      state.choiceLoading = false;
      await hooks.render(host, prompt, state);
    }
  }
}

function firstEnabledChoiceIndexFrom(choices: readonly PromptChoice<unknown>[], start: number): number | undefined {
  for (let index = start; index < choices.length; index += 1) {
    const choice = choices[index];
    if (choice !== undefined && !choice.disabled) return index;
  }
  return undefined;
}
