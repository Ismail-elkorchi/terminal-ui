import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { CommandInputAction } from '../ui-model/command-input.ts';
import type { SuggestionItem } from '../ui-model/contracts.ts';
import { applyTextPointerAction } from './text-editing.ts';

export interface CommandInputState {
  readonly input: TextEditBuffer;
  readonly history: readonly string[];
  readonly historyIndex?: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly selectedSuggestionIndex?: number;
}

export function commandInputReducer(state: CommandInputState, action: CommandInputAction): CommandInputState {
  switch (action.kind) {
    case 'edit':
      return withClearedHistory({
        ...state,
        input: editTextBuffer(state.input, action.operation)
      });
    case 'pointer':
      return withClearedHistory({ ...state, input: applyTextPointerAction(state.input, action.action) });
    case 'setValue':
      return withClearedHistory({ ...state, input: { text: action.value, cursor: action.value.length } });
    case 'historyPrevious':
      return commandInputHistory(state, -1);
    case 'historyNext':
      return commandInputHistory(state, 1);
    case 'moveSuggestion':
      return moveSuggestion(state, action.delta);
    case 'selectSuggestion':
      return selectSuggestion(state, action.suggestionIndex);
    case 'acceptSuggestion': {
      const suggestion = acceptedSuggestion(state);
      return suggestion === undefined || suggestion.disabled === true
        ? state
        : withClearedSuggestion({ ...state, input: { text: suggestion.value, cursor: suggestion.value.length } });
    }
  }
}

function commandInputHistory(state: CommandInputState, direction: 1 | -1): CommandInputState {
  if (state.history.length === 0) return state;
  const current = state.historyIndex ?? state.history.length;
  const next = clampIndex(current + direction, state.history.length + 1);
  if (next >= state.history.length) {
    return withClearedHistory({ ...state, input: { text: '', cursor: 0 } });
  }
  const value = state.history[next] ?? '';
  return { ...state, input: { text: value, cursor: value.length }, historyIndex: next };
}

function moveSuggestion(state: CommandInputState, direction: 1 | -1): CommandInputState {
  if (state.suggestions.length === 0) return state;
  const current = state.selectedSuggestionIndex ?? (direction === 1 ? -1 : 0);
  for (let offset = 1; offset <= state.suggestions.length; offset += 1) {
    const selectedSuggestionIndex = (current + (direction * offset) + state.suggestions.length) % state.suggestions.length;
    if (state.suggestions[selectedSuggestionIndex]?.disabled !== true) {
      return { ...state, selectedSuggestionIndex };
    }
  }
  return withClearedSuggestion(state);
}

function selectSuggestion(state: CommandInputState, index: number): CommandInputState {
  const normalized = Math.floor(index);
  const suggestion = state.suggestions[normalized];
  return suggestion === undefined || suggestion.disabled === true
    ? state
    : { ...state, selectedSuggestionIndex: normalized };
}

function withClearedHistory(state: CommandInputState): CommandInputState {
  return {
    input: state.input,
    history: state.history,
    suggestions: state.suggestions,
    ...(state.selectedSuggestionIndex === undefined ? {} : { selectedSuggestionIndex: state.selectedSuggestionIndex })
  };
}

function withClearedSuggestion(state: CommandInputState): CommandInputState {
  return {
    input: state.input,
    history: state.history,
    suggestions: state.suggestions,
    ...(state.historyIndex === undefined ? {} : { historyIndex: state.historyIndex })
  };
}

function acceptedSuggestion(state: CommandInputState): SuggestionItem | undefined {
  return state.selectedSuggestionIndex === undefined
    ? state.suggestions.find((suggestion) => suggestion.disabled !== true)
    : state.suggestions[state.selectedSuggestionIndex];
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}
