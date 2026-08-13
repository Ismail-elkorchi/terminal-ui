import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { CommandInputTransition, CommandSuggestion } from '../ui-model/command-input.ts';
import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxViewEntry,
  WindowedListboxCollection,
} from '../ui-model/list.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';
import { collectionRecordById } from '../ui-model/collection.ts';
import { prepareListboxCollection } from './list.ts';
import { prepareListboxView } from '../ui-model/list-view.ts';
import { applyTextPointerAction } from './text-editing.ts';

export interface CommandInputState {
  readonly input: TextEditBuffer;
  readonly history: readonly string[];
  readonly historyIndex?: number;
  readonly suggestions: ListboxCollection<string>;
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
      return suggestion === undefined || suggestion.item.disabled
        ? state
        : withClearedSuggestion({ ...state, input: { text: suggestion.value, cursor: suggestion.value.length } });
    }
    case 'dismissSuggestions':
      return {
        input: state.input,
        history: state.history,
        suggestions: emptyCommandSuggestions,
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
  const view = prepareListboxView(state.suggestions);
  if (view.selectable.length === 0) return state;
  const current = state.activeSuggestionId === undefined
    ? undefined
    : view.interactionIndex.positions.get(state.activeSuggestionId);
  const start = current ?? (direction > 0 ? -1 : 0);
  const next = (start + direction + view.selectable.length) % view.selectable.length;
  const suggestion = view.selectable[next];
  return suggestion === undefined ? state : { ...state, activeSuggestionId: suggestion.id };
}

function setActiveSuggestion(state: CommandInputState, id: string): CommandInputState {
  const view = prepareListboxView(state.suggestions);
  return !view.interactionIndex.positions.has(id)
    ? state
    : { ...state, activeSuggestionId: id };
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

function acceptedSuggestion(state: CommandInputState): ListboxViewEntry<string> | undefined {
  const view = prepareListboxView(state.suggestions);
  if (state.activeSuggestionId === undefined) return view.selectable[0];
  const record = collectionRecordById(view.source, state.activeSuggestionId);
  if (record?.item.disabled !== false) return undefined;
  const position = view.interactionIndex.positions.get(record.id);
  return position === undefined ? undefined : view.selectable[position];
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}

export function prepareCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
): CompleteListboxCollection<string>;
export function prepareCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
  window: CollectionWindow,
): WindowedListboxCollection<string>;
export function prepareCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
  window?: CollectionWindow,
): ListboxCollection<string> {
  const values = suggestions.map((suggestion) => {
    if (typeof suggestion.value !== 'string') {
      throw new TypeError('command suggestion value must be a string.');
    }
    return suggestion.value;
  });
  const startIndex = window?.startIndex ?? 0;
  const projector = (_value: string, itemIndex: number) => {
    const suggestion = suggestions[itemIndex - startIndex];
    if (suggestion === undefined) throw new RangeError('command suggestion window index is invalid.');
    return ({
    id: suggestion.id,
    label: suggestion.label ?? suggestion.value,
    ...(suggestion.description === undefined ? {} : { description: suggestion.description }),
    disabled: suggestion.disabled === true,
    });
  };
  return window === undefined
    ? prepareListboxCollection(values, projector)
    : prepareListboxCollection(values, projector, window);
}

const emptyCommandSuggestions = prepareCommandSuggestions([]);
