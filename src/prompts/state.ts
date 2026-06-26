import { firstEnabledChoiceIndex, initialSelectedChoiceIndexes } from './choices.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { ChoiceResolution } from './choices.ts';
import type { PromptChoice, PromptDataSourceResult, PromptDefinition } from './types.ts';

export interface PromptRuntimeState {
  buffer: TextEditBuffer;
  choices: readonly PromptChoice<unknown>[];
  focusedChoiceIndex: number;
  selectedChoiceIndexes: Set<number>;
  choiceRangeAnchorIndex?: number;
  choiceLoading: boolean;
  choiceLoadVersion: number;
  choiceDiagnostics: readonly TerminalDiagnostic[];
  choiceHasMore: boolean;
  choiceTotal?: number;
  choiceController?: AbortController;
  choiceDebounceController?: AbortController;
  validationStatus: 'idle' | 'running' | 'valid' | 'invalid';
  validationVersion: number;
  validationDiagnostic?: TerminalDiagnostic;
  validationController?: AbortController;
  completed: boolean;
  confirmValue?: boolean;
}

export function initialPromptState<TValue>(
  prompt: PromptDefinition<TValue>,
  resolution: ChoiceResolution = { ok: true, choices: [], diagnostics: [], hasMore: false }
): PromptRuntimeState {
  const choices = resolution.ok ? resolution.choices : [];
  const selectedChoiceIndexes = initialSelectedChoiceIndexes(prompt, choices);
  const selectedChoiceIndex = selectedChoiceIndexes.values().next().value;
  const focusedChoiceIndex = selectedChoiceIndex
    ?? firstEnabledChoiceIndex(choices)
    ?? 0;
  const choiceRangeAnchorIndex = prompt.kind === 'multiselect' && choices.length > 0
    ? focusedChoiceIndex
    : undefined;
  if (prompt.kind === 'confirm') {
    return {
      ...basePromptState(resolution, choices, focusedChoiceIndex, selectedChoiceIndexes, choiceRangeAnchorIndex),
      ...(typeof prompt.defaultValue === 'boolean' ? { confirmValue: prompt.defaultValue } : {})
    };
  }
  const initial = typeof prompt.defaultValue === 'string' ? prompt.defaultValue : '';
  return {
    ...basePromptState(resolution, choices, focusedChoiceIndex, selectedChoiceIndexes, choiceRangeAnchorIndex),
    buffer: { text: initial, cursor: initial.length }
  };
}

export function setChoiceTotal(
  state: PromptRuntimeState,
  total: PromptDataSourceResult<unknown>['total']
): void {
  if (total === undefined) {
    delete (state as { choiceTotal?: number }).choiceTotal;
    return;
  }
  state.choiceTotal = total;
}

export function completePromptState(state: PromptRuntimeState): void {
  state.completed = true;
  state.choiceDebounceController?.abort();
  state.choiceController?.abort();
  state.validationController?.abort();
}

function basePromptState(
  resolution: ChoiceResolution,
  choices: readonly PromptChoice<unknown>[],
  focusedChoiceIndex: number,
  selectedChoiceIndexes: Set<number>,
  choiceRangeAnchorIndex: number | undefined
): PromptRuntimeState {
  return {
    buffer: { text: '', cursor: 0 },
    choices,
    focusedChoiceIndex,
    selectedChoiceIndexes,
    ...(choiceRangeAnchorIndex === undefined ? {} : { choiceRangeAnchorIndex }),
    choiceLoading: false,
    choiceLoadVersion: 0,
    choiceDiagnostics: resolution.ok ? resolution.diagnostics : resolution.diagnostics,
    choiceHasMore: resolution.ok ? resolution.hasMore : false,
    ...(resolution.ok && resolution.total !== undefined ? { choiceTotal: resolution.total } : {}),
    validationStatus: 'idle',
    validationVersion: 0,
    completed: false
  };
}
