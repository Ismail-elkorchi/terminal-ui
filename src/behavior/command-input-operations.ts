import type { CollectionWindow } from '../collection/snapshot.ts';
import { collectionInteractionCount, collectionInteractionIdAt } from '../interaction/collection-interaction.ts';
import type {
  EditablePopupInputState,
  EditablePopupInputTransition,
} from '../interaction/editable-popup-input.ts';
import {
  acceptEditablePopupCompletion,
  createEditablePopupInputState,
  editablePopupInputReducer,
} from '../interaction/editable-popup-input.ts';
import type { EditHistoryPolicy } from '../text/bounded-history.ts';
import { sanitizeTerminalText } from '../text/sanitize.ts';
import type { TextEditBuffer } from '../text/types.ts';
import type {
  CommandCompletion,
  CommandInputTransition,
  CommandInputView,
  CommandSuggestion,
} from './command-input.ts';
import { createListboxCollection } from './listbox-operations.ts';
import { createListboxView } from './listbox-view.ts';
import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxView,
  ListboxViewEntry,
  WindowedListboxCollection,
} from './listbox.ts';

const DEFAULT_SUBMISSION_LIMIT = 100;

export interface CommandInputState {
  readonly editor: EditablePopupInputState;
  readonly submissions: readonly string[];
  readonly submissionLimit: number;
  readonly draft?: TextEditBuffer;
  readonly submissionIndex?: number;
  readonly suggestions: ListboxCollection<CommandCompletion>;
  readonly suggestionView: ListboxView<CommandCompletion>;
}

export function commandInputView(state: CommandInputState): CommandInputView {
  return {
    input: state.editor.input,
    open: state.editor.open,
    suggestions: state.suggestions,
    suggestionView: state.suggestionView,
    ...(!state.editor.open || state.editor.activeId === undefined
      ? {}
      : { activeSuggestionId: state.editor.activeId }),
    ...(state.submissionIndex === undefined ? {} : { submissionIndex: state.submissionIndex })
  };
}

export interface CreateCommandInputStateInput {
  readonly value?: string;
  readonly cursor?: number;
  readonly submissions?: readonly string[];
  readonly submissionLimit?: number;
  readonly suggestions: ListboxCollection<CommandCompletion>;
  readonly editHistoryPolicy?: EditHistoryPolicy;
}

export function createCommandInputState(input: CreateCommandInputStateInput): CommandInputState {
  const submissionLimit = boundedCount(
    input.submissionLimit ?? DEFAULT_SUBMISSION_LIMIT,
    'command input submissionLimit'
  );
  const suggestions = createListboxView(input.suggestions);
  return {
    editor: createEditablePopupInputState({
      ...(input.value === undefined ? {} : { value: input.value }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      open: collectionInteractionCount(suggestions.interactionIndex) > 0,
      ...(input.editHistoryPolicy === undefined ? {} : {
        editHistoryPolicy: input.editHistoryPolicy
      })
    }, suggestions.interactionIndex),
    submissions: ownSubmissions(input.submissions ?? [], submissionLimit),
    submissionLimit,
    suggestions: input.suggestions,
    suggestionView: suggestions,
  };
}

export function commandInputReducer(
  state: CommandInputState,
  transition: CommandInputTransition
): CommandInputState {
  switch (transition.kind) {
    case 'edit':
      return applyCommandTransition(state, transition);
    case 'undo':
    case 'redo':
    case 'pointer':
      return applyCommandTransition(state, transition);
    case 'setValue':
      return applyCommandTransition(state, { kind: 'setText', value: transition.value });
    case 'recordSubmission':
      return recordSubmission(state, transition.value);
    case 'setSuggestions':
      return setCommandSuggestions(state, transition.suggestions);
    case 'historyPrevious':
      return commandInputHistory(state, -1);
    case 'historyNext':
      return commandInputHistory(state, 1);
    case 'moveSuggestion':
      return applyCommandTransition(state, { kind: 'moveActive', delta: transition.delta });
    case 'setActiveSuggestion':
      return applyCommandTransition(state, { kind: 'setActive', id: transition.id });
    case 'acceptSuggestion': {
      const suggestion = acceptedSuggestion(state);
      if (suggestion === undefined || suggestion.option.disabled) return state;
      const editor = acceptEditablePopupCompletion(
        state.editor,
        suggestion.value,
        commandEditorOptions(state.suggestionView),
      );
      return leaveSubmissionHistory({ ...state, editor });
    }
    case 'dismissSuggestions':
      return {
        ...state,
        editor: editablePopupInputReducer(
          state.editor,
          { kind: 'dismiss', reason: transition.reason },
          commandEditorOptions(state.suggestionView),
        ),
      };
  }
}

function applyCommandTransition(
  state: CommandInputState,
  transition: EditablePopupInputTransition,
): CommandInputState {
  const editor = editablePopupInputReducer(
    state.editor,
    transition,
    commandEditorOptions(state.suggestionView),
  );
  return editor === state.editor ? state : leaveSubmissionHistory({ ...state, editor });
}

function commandInputHistory(state: CommandInputState, direction: 1 | -1): CommandInputState {
  if (state.submissions.length === 0) return state;
  const current = state.submissionIndex ?? state.submissions.length;
  const next = Math.max(0, Math.min(state.submissions.length, current + direction));
  if (next === current) return state;
  if (next === state.submissions.length) {
    const draft = state.draft ?? { text: '', cursor: 0 };
    return withoutSubmissionTraversal({
      ...state,
      editor: createEditablePopupInputState({
        value: draft.text,
        cursor: draft.cursor,
        open: state.editor.open,
        editHistoryPolicy: state.editor.editHistory.policy,
      }, state.suggestionView.interactionIndex),
    });
  }
  const value = state.submissions[next];
  if (value === undefined) return state;
  return {
    ...state,
    editor: createEditablePopupInputState({
      value,
      open: state.editor.open,
      editHistoryPolicy: state.editor.editHistory.policy,
    }, state.suggestionView.interactionIndex),
    draft: state.draft ?? ownBuffer(state.editor.input),
    submissionIndex: next
  };
}

function recordSubmission(state: CommandInputState, rawValue: string): CommandInputState {
  const value = sanitizeTerminalText(rawValue).text;
  const submissions = value.length === 0 || state.submissionLimit === 0
    ? state.submissions
    : Object.freeze([...state.submissions, value].slice(-state.submissionLimit));
  return withoutSubmissionTraversal({
    ...state,
    editor: createEditablePopupInputState({
      editHistoryPolicy: state.editor.editHistory.policy,
    }, state.suggestionView.interactionIndex),
    submissions
  });
}

function setCommandSuggestions(
  state: CommandInputState,
  suggestions: ListboxCollection<CommandCompletion>,
): CommandInputState {
  const view = createListboxView(suggestions);
  let editor = editablePopupInputReducer(
    state.editor,
    { kind: 'setActive', ...(state.editor.activeId === undefined ? {} : { id: state.editor.activeId }) },
    commandEditorOptions(view),
  );
  editor = editablePopupInputReducer(
    editor,
    collectionInteractionCount(view.interactionIndex) === 0
      ? { kind: 'dismiss', reason: 'programmatic' }
      : { kind: 'open' },
    commandEditorOptions(view),
  );
  return { ...state, suggestions, suggestionView: view, editor };
}

function acceptedSuggestion(
  state: CommandInputState
): ListboxViewEntry<CommandCompletion> | undefined {
  const view = state.suggestionView;
  const id = state.editor.activeId ?? collectionInteractionIdAt(view.interactionIndex, 0);
  if (id === undefined) return undefined;
  const entry = view.entryById(id);
  return entry?.option.disabled === false ? entry : undefined;
}

function leaveSubmissionHistory(state: CommandInputState): CommandInputState {
  if (state.submissionIndex === undefined && state.draft === undefined) return state;
  return withoutSubmissionTraversal(state);
}

function withoutSubmissionTraversal(state: CommandInputState): CommandInputState {
  const { draft, submissionIndex, ...rest } = state;
  void draft;
  void submissionIndex;
  return rest;
}

function commandEditorOptions(
  suggestions: ListboxView<CommandCompletion>,
) {
  const index = suggestions.interactionIndex;
  return {
    indexForText: () => index,
    openOnEdit: suggestions.totalCount > 0,
  };
}

function ownBuffer(buffer: TextEditBuffer): TextEditBuffer {
  return Object.freeze({
    text: buffer.text,
    cursor: buffer.cursor,
    ...(buffer.selection === undefined ? {} : {
      selection: Object.freeze({ ...buffer.selection })
    })
  });
}

function ownSubmissions(values: readonly string[], limit: number): readonly string[] {
  const owned = values.map((value) => sanitizeTerminalText(value).text);
  return Object.freeze(limit === 0 ? [] : owned.slice(-limit));
}

function boundedCount(value: number, owner: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}

export function createCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
): CompleteListboxCollection<CommandCompletion>;
export function createCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
  window: CollectionWindow,
): WindowedListboxCollection<CommandCompletion>;
export function createCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
  window?: CollectionWindow,
): ListboxCollection<CommandCompletion> {
  const values = suggestions.map((suggestion) => ownCompletion(suggestion.completion));
  const startIndex = window?.startIndex ?? 0;
  const toOption = (_value: CommandCompletion, itemIndex: number) => {
    const suggestion = suggestions[itemIndex - startIndex];
    const completion = values[itemIndex - startIndex];
    if (suggestion === undefined || completion === undefined) {
      throw new RangeError('command suggestion window index is invalid.');
    }
    return {
      id: suggestion.id,
      label: suggestion.label ?? completion.text,
      ...(suggestion.description === undefined ? {} : { description: suggestion.description }),
      disabled: suggestion.disabled === true,
    };
  };
  return window === undefined
    ? createListboxCollection(values, toOption)
    : createListboxCollection(values, toOption, window);
}

function ownCompletion(completion: CommandCompletion): CommandCompletion {
  const startOffset = boundedCount(completion.range.startOffset, 'command completion range startOffset');
  const endOffsetExclusive = boundedCount(
    completion.range.endOffsetExclusive,
    'command completion range endOffsetExclusive'
  );
  return Object.freeze({
    range: Object.freeze({ startOffset, endOffsetExclusive }),
    text: sanitizeTerminalText(completion.text).text
  });
}
