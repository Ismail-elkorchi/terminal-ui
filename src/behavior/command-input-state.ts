import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { CommandInputAction } from '../ui-model/command-input.ts';
import type { SuggestionItem } from '../ui-model/contracts.ts';

export interface CommandInputState {
  readonly input: TextEditBuffer;
  readonly history: readonly string[];
  readonly historyIndex?: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly selectedSuggestion?: number;
}

export function commandInputReducer(state: CommandInputState, action: CommandInputAction): CommandInputState {
  switch (action.kind) {
    case 'insert':
    case 'deleteBackward':
    case 'deleteForward':
    case 'deleteWordBackward':
    case 'deleteWordForward':
    case 'moveLeft':
    case 'moveRight':
    case 'moveWordLeft':
    case 'moveWordRight':
    case 'moveHome':
    case 'moveEnd':
    case 'selectAll':
      return withClearedHistory({
        ...state,
        input: editTextBuffer(state.input, actionToTextEdit(action))
      });
    case 'setValue':
      return withClearedHistory({ ...state, input: { text: action.value, cursor: action.value.length } });
    case 'historyPrevious':
      return commandInputHistory(state, -1);
    case 'historyNext':
      return commandInputHistory(state, 1);
    case 'moveSuggestion':
      return moveSuggestion(state, action.delta);
    case 'selectSuggestion':
      return selectSuggestion(state, action.index);
    case 'acceptSuggestion': {
      const suggestion = acceptedSuggestion(state);
      return suggestion === undefined || suggestion.disabled === true
        ? state
        : withClearedSuggestion({ ...state, input: { text: suggestion.value, cursor: suggestion.value.length } });
    }
  }
}

function actionToTextEdit(
  action: Extract<
    CommandInputAction,
    {
      readonly kind:
        | 'insert'
        | 'deleteBackward'
        | 'deleteForward'
        | 'deleteWordBackward'
        | 'deleteWordForward'
        | 'moveLeft'
        | 'moveRight'
        | 'moveWordLeft'
        | 'moveWordRight'
        | 'moveHome'
        | 'moveEnd'
        | 'selectAll';
    }
  >
): Parameters<typeof editTextBuffer>[1] {
  switch (action.kind) {
    case 'insert':
      return { kind: 'insert', text: action.text };
    case 'deleteBackward':
    case 'deleteForward':
    case 'deleteWordBackward':
    case 'deleteWordForward':
    case 'selectAll':
      return { kind: action.kind };
    case 'moveLeft':
      return optionalSelection('moveLeft', action.select);
    case 'moveRight':
      return optionalSelection('moveRight', action.select);
    case 'moveWordLeft':
      return optionalSelection('moveWordLeft', action.select);
    case 'moveWordRight':
      return optionalSelection('moveWordRight', action.select);
    case 'moveHome':
      return optionalSelection('moveHome', action.select);
    case 'moveEnd':
      return optionalSelection('moveEnd', action.select);
  }
}

function optionalSelection(
  kind: 'moveLeft',
  select: boolean | undefined
): Extract<Parameters<typeof editTextBuffer>[1], { readonly kind: 'moveLeft' }>;
function optionalSelection(
  kind: 'moveRight',
  select: boolean | undefined
): Extract<Parameters<typeof editTextBuffer>[1], { readonly kind: 'moveRight' }>;
function optionalSelection(
  kind: 'moveWordLeft',
  select: boolean | undefined
): Extract<Parameters<typeof editTextBuffer>[1], { readonly kind: 'moveWordLeft' }>;
function optionalSelection(
  kind: 'moveWordRight',
  select: boolean | undefined
): Extract<Parameters<typeof editTextBuffer>[1], { readonly kind: 'moveWordRight' }>;
function optionalSelection(
  kind: 'moveHome',
  select: boolean | undefined
): Extract<Parameters<typeof editTextBuffer>[1], { readonly kind: 'moveHome' }>;
function optionalSelection(
  kind: 'moveEnd',
  select: boolean | undefined
): Extract<Parameters<typeof editTextBuffer>[1], { readonly kind: 'moveEnd' }>;
function optionalSelection(
  kind: 'moveLeft' | 'moveRight' | 'moveWordLeft' | 'moveWordRight' | 'moveHome' | 'moveEnd',
  select: boolean | undefined
): Parameters<typeof editTextBuffer>[1] {
  return select === undefined ? { kind } : { kind, select };
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
  const current = state.selectedSuggestion ?? (direction === 1 ? -1 : 0);
  for (let offset = 1; offset <= state.suggestions.length; offset += 1) {
    const selectedSuggestion = (current + (direction * offset) + state.suggestions.length) % state.suggestions.length;
    if (state.suggestions[selectedSuggestion]?.disabled !== true) {
      return { ...state, selectedSuggestion };
    }
  }
  return withClearedSuggestion(state);
}

function selectSuggestion(state: CommandInputState, index: number): CommandInputState {
  const normalized = Math.floor(index);
  const suggestion = state.suggestions[normalized];
  return suggestion === undefined || suggestion.disabled === true
    ? state
    : { ...state, selectedSuggestion: normalized };
}

function withClearedHistory(state: CommandInputState): CommandInputState {
  return {
    input: state.input,
    history: state.history,
    suggestions: state.suggestions,
    ...(state.selectedSuggestion === undefined ? {} : { selectedSuggestion: state.selectedSuggestion })
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
  return state.selectedSuggestion === undefined
    ? state.suggestions.find((suggestion) => suggestion.disabled !== true)
    : state.suggestions[state.selectedSuggestion];
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}
