import { diagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { InputEvent, KeyEvent } from '../input/index.ts';
import { segmentGraphemes } from '../text/index.ts';
import { editPromptBufferForEvent } from './buffer-edit.ts';
import { maybeLoadNextChoicePage, scheduleAutocompleteChoiceRefresh } from './choice-loading.ts';
import {
  enabledChoiceAt,
  findChoiceBySearch,
  firstEnabledChoiceIndex,
  isChoiceDisabled,
  lastEnabledChoiceIndex,
  nextEnabledChoiceIndex
} from './choices.ts';
import type { PromptInteractionHooks } from './interaction-hooks.ts';
import { createPromptSnapshot, promptValueForSnapshot } from './snapshot.ts';
import { completePromptState, type PromptRuntimeState } from './state.ts';
import type {
  AutocompletePromptDefinition,
  MultiSelectPromptDefinition,
  PromptResult,
  SelectPromptDefinition
} from './types.ts';

export async function applySelectEvent<TValue>(
  prompt: SelectPromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState<TValue>,
  event: InputEvent,
  hooks: PromptInteractionHooks<TValue, SelectPromptDefinition<TValue>, TValue>
): Promise<PromptResult<TValue> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    const choice = enabledChoiceAt(state.choices, state.focusedChoiceIndex);
    if (choice === undefined) return undefined;
    return hooks.submit(prompt, choice.value, host, state);
  }
  const moved = moveChoiceFocusFromEvent(state, event);
  if (moved) {
    await hooks.render(host, prompt, state);
    return undefined;
  }
  if (await maybeLoadNextChoicePage(prompt, host, state, event, hooks)) return undefined;
  if (event.kind === 'text') {
    let changed = false;
    for (const grapheme of segmentGraphemes(event.text)) {
      const match = advanceChoiceSearch(state, grapheme.text, host.clock.monotonicNow());
      if (match !== undefined && match !== state.focusedChoiceIndex) {
        state.focusedChoiceIndex = match;
        changed = true;
      }
    }
    if (changed) await hooks.render(host, prompt, state);
  }
  return undefined;
}

export async function applyMultiSelectEvent<TValue>(
  prompt: MultiSelectPromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState<TValue>,
  event: InputEvent,
  hooks: PromptInteractionHooks<TValue, MultiSelectPromptDefinition<TValue>, readonly TValue[]>
): Promise<PromptResult<readonly TValue[]> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    const values = [...state.selectedChoiceIndexes]
      .sort((left, right) => left - right)
      .map((index) => state.choices[index]?.value)
      .filter((value): value is TValue => value !== undefined);
    const bounds = validateMultiSelectBounds(prompt, state, values.length);
    if (bounds !== undefined) return bounds;
    return hooks.submit(
      prompt,
      values,
      host,
      state
    );
  }
  if (event.kind === 'key' && event.key === 'space') {
    clearChoiceSearch(state);
    toggleFocusedChoice(prompt, state);
    await hooks.render(host, prompt, state);
    return undefined;
  }
  if (isMultiSelectRangeEvent(prompt, event)) {
    const anchorIndex = state.choiceRangeAnchorIndex ?? state.focusedChoiceIndex;
    const moved = moveChoiceFocusFromEvent(state, event);
    if (moved) {
      selectChoiceRange(prompt, state, anchorIndex, state.focusedChoiceIndex);
      await hooks.render(host, prompt, state);
    }
    return undefined;
  }
  const moved = moveChoiceFocusFromEvent(state, event);
  if (moved) {
    await hooks.render(host, prompt, state);
    return undefined;
  }
  if (await maybeLoadNextChoicePage(prompt, host, state, event, hooks)) return undefined;
  if (event.kind === 'text') {
    let changed = false;
    for (const grapheme of segmentGraphemes(event.text)) {
      if (grapheme.text === ' ') {
        clearChoiceSearch(state);
        toggleFocusedChoice(prompt, state);
        changed = true;
        continue;
      }
      const match = advanceChoiceSearch(state, grapheme.text, host.clock.monotonicNow());
      if (match !== undefined) {
        state.focusedChoiceIndex = match;
        state.choiceRangeAnchorIndex = match;
        changed = true;
      }
    }
    if (changed) await hooks.render(host, prompt, state);
  }
  return undefined;
}

export async function applyAutocompleteEvent<TValue>(
  prompt: AutocompletePromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState<TValue>,
  event: InputEvent,
  hooks: PromptInteractionHooks<TValue, AutocompletePromptDefinition<TValue>, TValue>
): Promise<PromptResult<TValue> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    const choice = enabledChoiceAt(state.choices, state.focusedChoiceIndex);
    if (choice === undefined) return undefined;
    state.completed = true;
    state.choiceDebounceController?.abort();
    state.choiceController?.abort();
    return hooks.submit(prompt, choice.value, host, state);
  }
  const moved = moveChoiceFocusFromEvent(state, event);
  if (moved) {
    await hooks.render(host, prompt, state);
    return undefined;
  }
  if (await maybeLoadNextChoicePage(prompt, host, state, event, hooks)) return undefined;
  const changed = applyAutocompleteTextEvent(state, event);
  if (!changed) return undefined;
  await hooks.render(host, prompt, state);
  scheduleAutocompleteChoiceRefresh(prompt, host, state, hooks);
  return undefined;
}

function applyAutocompleteTextEvent<TValue>(state: PromptRuntimeState<TValue>, event: InputEvent): boolean {
  return editPromptBufferForEvent(state, event);
}

function moveChoiceFocusFromEvent<TValue>(state: PromptRuntimeState<TValue>, event: InputEvent): boolean {
  if (event.kind !== 'key') return false;
  const nextIndex = nextChoiceFocusIndexFromEvent(state, event);
  if (nextIndex === undefined || nextIndex === state.focusedChoiceIndex) return false;
  clearChoiceSearch(state);
  state.focusedChoiceIndex = nextIndex;
  return true;
}

const choiceSearchTimeoutMs = 500;

function advanceChoiceSearch<TValue>(
  state: PromptRuntimeState<TValue>,
  text: string,
  now: number
): number | undefined {
  const continues = now - state.choiceSearchAt >= 0
    && now - state.choiceSearchAt <= choiceSearchTimeoutMs;
  const query = continues ? state.choiceSearchText + text : text;
  let match = findChoiceBySearch(
    state.choices,
    query,
    continues ? state.focusedChoiceIndex : state.focusedChoiceIndex + 1
  );
  if (match === undefined && query !== text) {
    state.choiceSearchText = text;
    match = findChoiceBySearch(state.choices, text, state.focusedChoiceIndex + 1);
  } else {
    state.choiceSearchText = query;
  }
  state.choiceSearchAt = now;
  return match;
}

function clearChoiceSearch<TValue>(state: PromptRuntimeState<TValue>): void {
  state.choiceSearchText = '';
  state.choiceSearchAt = Number.NEGATIVE_INFINITY;
}

function nextChoiceFocusIndexFromEvent<TValue>(state: PromptRuntimeState<TValue>, event: KeyEvent): number | undefined {
  switch (event.key) {
    case 'arrowDown':
      return nextEnabledChoiceIndex(state.choices, state.focusedChoiceIndex, 1)
        ?? state.focusedChoiceIndex;
    case 'arrowUp':
      return nextEnabledChoiceIndex(state.choices, state.focusedChoiceIndex, -1)
        ?? state.focusedChoiceIndex;
    case 'home':
      return firstEnabledChoiceIndex(state.choices) ?? state.focusedChoiceIndex;
    case 'end':
      return lastEnabledChoiceIndex(state.choices) ?? state.focusedChoiceIndex;
    default:
      return undefined;
  }
}

function toggleFocusedChoice<TValue>(
  prompt: MultiSelectPromptDefinition<TValue>,
  state: PromptRuntimeState<TValue>
): void {
  const choice = enabledChoiceAt(state.choices, state.focusedChoiceIndex);
  if (choice === undefined) return;
  if (state.selectedChoiceIndexes.has(state.focusedChoiceIndex)) {
    state.selectedChoiceIndexes.delete(state.focusedChoiceIndex);
    state.choiceRangeAnchorIndex = state.focusedChoiceIndex;
    return;
  }
  if (prompt.maxSelected !== undefined && state.selectedChoiceIndexes.size >= prompt.maxSelected) return;
  state.selectedChoiceIndexes.add(state.focusedChoiceIndex);
  state.choiceRangeAnchorIndex = state.focusedChoiceIndex;
}

function isMultiSelectRangeEvent<TValue>(prompt: MultiSelectPromptDefinition<TValue>, event: InputEvent): boolean {
  return prompt.rangeSelection === true
    && event.kind === 'key'
    && event.modifiers.shift
    && (event.key === 'arrowDown' || event.key === 'arrowUp' || event.key === 'home' || event.key === 'end');
}

function selectChoiceRange<TValue>(
  prompt: MultiSelectPromptDefinition<TValue>,
  state: PromptRuntimeState<TValue>,
  anchorIndex: number,
  focusIndex: number
): void {
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  for (let index = start; index <= end; index += 1) {
    const choice = state.choices[index];
    if (choice === undefined || isChoiceDisabled(choice) || state.selectedChoiceIndexes.has(index)) continue;
    if (prompt.maxSelected !== undefined && state.selectedChoiceIndexes.size >= prompt.maxSelected) break;
    state.selectedChoiceIndexes.add(index);
  }
  state.choiceRangeAnchorIndex = anchorIndex;
}

function validateMultiSelectBounds<TValue>(
  prompt: MultiSelectPromptDefinition<TValue>,
  state: PromptRuntimeState<TValue>,
  count: number
): PromptResult<readonly TValue[]> | undefined {
  if (prompt.minSelected !== undefined && count < prompt.minSelected) {
    return multiSelectValidationFailure(prompt, state, `Select at least ${String(prompt.minSelected)} option(s).`);
  }
  if (prompt.maxSelected !== undefined && count > prompt.maxSelected) {
    return multiSelectValidationFailure(prompt, state, `Select at most ${String(prompt.maxSelected)} option(s).`);
  }
  return undefined;
}

function multiSelectValidationFailure<TValue>(
  prompt: MultiSelectPromptDefinition<TValue>,
  state: PromptRuntimeState<TValue>,
  message: string
): PromptResult<readonly TValue[]> {
  completePromptState(state);
  return {
    status: 'aborted',
    reason: 'validation_failed',
    diagnostics: [diagnostic('PROMPT_VALIDATION_FAILED', message)],
    snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
  };
}
