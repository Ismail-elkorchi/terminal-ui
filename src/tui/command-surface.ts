import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer } from '../text/index.ts';

export interface CommandBarState {
  readonly input: TextEditBuffer;
  readonly history: readonly string[];
  readonly historyIndex?: number;
  readonly suggestions: readonly string[];
  readonly selectedSuggestion?: number;
}

export type CommandBarAction =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'deleteBackward' }
  | { readonly kind: 'deleteForward' }
  | { readonly kind: 'moveLeft' }
  | { readonly kind: 'moveRight' }
  | { readonly kind: 'moveHome' }
  | { readonly kind: 'moveEnd' }
  | { readonly kind: 'historyPrevious' }
  | { readonly kind: 'historyNext' }
  | { readonly kind: 'selectSuggestion'; readonly direction: 1 | -1 }
  | { readonly kind: 'acceptSuggestion' }
  | { readonly kind: 'setValue'; readonly value: string };

export function commandBarReducer(state: CommandBarState, action: CommandBarAction): CommandBarState {
  switch (action.kind) {
    case 'insert':
    case 'deleteBackward':
    case 'deleteForward':
    case 'moveLeft':
    case 'moveRight':
    case 'moveHome':
    case 'moveEnd':
      return withClearedHistory({
        ...state,
        input: editTextBuffer(state.input, actionToTextEdit(action))
      });
    case 'setValue':
      return withClearedHistory({ ...state, input: { text: action.value, cursor: action.value.length } });
    case 'historyPrevious':
      return commandBarHistory(state, -1);
    case 'historyNext':
      return commandBarHistory(state, 1);
    case 'selectSuggestion':
      return selectSuggestion(state, action.direction);
    case 'acceptSuggestion': {
      const suggestion = state.selectedSuggestion === undefined
        ? state.suggestions[0]
        : state.suggestions[state.selectedSuggestion];
      return suggestion === undefined
        ? state
        : withClearedSuggestion({ ...state, input: { text: suggestion, cursor: suggestion.length } });
    }
  }
}

function actionToTextEdit(
  action: Extract<
    CommandBarAction,
    { readonly kind: 'insert' | 'deleteBackward' | 'deleteForward' | 'moveLeft' | 'moveRight' | 'moveHome' | 'moveEnd' }
  >
): Parameters<typeof editTextBuffer>[1] {
  switch (action.kind) {
    case 'insert':
      return { kind: 'insert', text: action.text };
    case 'deleteBackward':
    case 'deleteForward':
    case 'moveLeft':
    case 'moveRight':
    case 'moveHome':
    case 'moveEnd':
      return { kind: action.kind };
  }
}

function commandBarHistory(state: CommandBarState, direction: 1 | -1): CommandBarState {
  if (state.history.length === 0) return state;
  const current = state.historyIndex ?? state.history.length;
  const next = clampIndex(current + direction, state.history.length + 1);
  if (next >= state.history.length) {
    return withClearedHistory({ ...state, input: { text: '', cursor: 0 } });
  }
  const value = state.history[next] ?? '';
  return { ...state, input: { text: value, cursor: value.length }, historyIndex: next };
}

function selectSuggestion(state: CommandBarState, direction: 1 | -1): CommandBarState {
  if (state.suggestions.length === 0) return state;
  const current = state.selectedSuggestion ?? (direction === 1 ? -1 : 0);
  const selectedSuggestion = (current + direction + state.suggestions.length) % state.suggestions.length;
  return { ...state, selectedSuggestion };
}

function withClearedHistory(state: CommandBarState): CommandBarState {
  return {
    input: state.input,
    history: state.history,
    suggestions: state.suggestions,
    ...(state.selectedSuggestion === undefined ? {} : { selectedSuggestion: state.selectedSuggestion })
  };
}

function withClearedSuggestion(state: CommandBarState): CommandBarState {
  return {
    input: state.input,
    history: state.history,
    suggestions: state.suggestions,
    ...(state.historyIndex === undefined ? {} : { historyIndex: state.historyIndex })
  };
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}
