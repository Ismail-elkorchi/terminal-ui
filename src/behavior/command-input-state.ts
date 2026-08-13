import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { CommandInputTransition } from '../ui-model/command-input.ts';
import type { SuggestionItem } from '../ui-model/contracts.ts';
import { applyTextPointerAction } from './text-editing.ts';

export interface CommandInputState {
  readonly input: TextEditBuffer;
  readonly history: readonly string[];
  readonly historyIndex?: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly activeSuggestionId?: string;
}

export function commandInputReducer(state: CommandInputState, action: CommandInputTransition): CommandInputState {
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
    case 'setActiveSuggestion':
      return setActiveSuggestion(state, action.id);
    case 'acceptSuggestion': {
      const suggestion = acceptedSuggestion(state);
      return suggestion === undefined || suggestion.disabled === true
        ? state
        : withClearedSuggestion({ ...state, input: { text: suggestion.value, cursor: suggestion.value.length } });
    }
    case 'dismissSuggestions':
      return {
        input: state.input,
        history: state.history,
        suggestions: [],
        ...(state.historyIndex === undefined ? {} : { historyIndex: state.historyIndex })
      };
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
  const current = state.suggestions.findIndex((suggestion) => suggestion.id === state.activeSuggestionId);
  for (let offset = 1; offset <= state.suggestions.length; offset += 1) {
    const candidateIndex = (current + (direction * offset) + state.suggestions.length) % state.suggestions.length;
    const suggestion = state.suggestions[candidateIndex];
    if (suggestion !== undefined && suggestion.disabled !== true) {
      return { ...state, activeSuggestionId: suggestion.id };
    }
  }
  return withClearedSuggestion(state);
}

function setActiveSuggestion(state: CommandInputState, id: string): CommandInputState {
  const suggestion = state.suggestions.find((candidate) => candidate.id === id);
  return suggestion === undefined || suggestion.disabled === true
    ? state
    : { ...state, activeSuggestionId: suggestion.id };
}

function withClearedHistory(state: CommandInputState): CommandInputState {
  return {
    input: state.input,
    history: state.history,
    suggestions: state.suggestions,
    ...(state.activeSuggestionId === undefined ? {} : { activeSuggestionId: state.activeSuggestionId })
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
  return state.activeSuggestionId === undefined
    ? state.suggestions.find((suggestion) => suggestion.disabled !== true)
    : state.suggestions.find((suggestion) => suggestion.id === state.activeSuggestionId);
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}
