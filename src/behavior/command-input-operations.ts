import {
  acceptEditablePopupCompletion,
  createEditablePopupInputState,
  editablePopupInputReducer,
} from '../interaction/editable-popup-input.ts';
import type {
  EditablePopupInputState,
  EditablePopupInputTransition,
} from '../interaction/editable-popup-input.ts';
import {
  sanitizeTerminalText
} from '../text/index.ts';
import type { EditHistoryPolicy, TextEditBuffer } from '../text/index.ts';
import type {
  CommandInputView,
  CommandCompletion,
  CommandInputTransition,
  CommandSuggestion
} from './command-input.ts';
import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxViewEntry,
  WindowedListboxCollection,
} from './listbox.ts';
import type { CollectionWindow } from '../collection/snapshot.ts';
import { collectionItemById } from '../collection/snapshot.ts';
import { createListboxCollection } from './listbox-operations.ts';
import { createListboxView } from './listbox-view.ts';
import { collectionInteractionPosition } from '../interaction/collection-interaction.ts';

const DEFAULT_SUBMISSION_LIMIT = 100;

export interface CommandInputState {
  readonly editor: EditablePopupInputState;
  readonly submissions: readonly string[];
  readonly submissionLimit: number;
  readonly draft?: TextEditBuffer;
  readonly submissionIndex?: number;
  readonly suggestions: ListboxCollection<CommandCompletion>;
}

export function commandInputView(state: CommandInputState): CommandInputView {
  return {
    input: state.editor.input,
    open: state.editor.open,
    suggestions: state.suggestions,
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
      open: suggestions.selectable.length > 0,
      ...(input.editHistoryPolicy === undefined ? {} : {
        editHistoryPolicy: input.editHistoryPolicy
      })
    }, suggestions.interactionIndex),
    submissions: ownSubmissions(input.submissions ?? [], submissionLimit),
    submissionLimit,
    suggestions: input.suggestions
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
        commandEditorOptions(state.suggestions),
      );
      return leaveSubmissionHistory({ ...state, editor });
    }
    case 'dismissSuggestions':
      return {
        ...state,
        editor: editablePopupInputReducer(
          state.editor,
          { kind: 'dismiss', reason: transition.reason },
          commandEditorOptions(state.suggestions),
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
    commandEditorOptions(state.suggestions),
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
      }, createListboxView(state.suggestions).interactionIndex),
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
    }, createListboxView(state.suggestions).interactionIndex),
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
    }, createListboxView(state.suggestions).interactionIndex),
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
    commandEditorOptions(suggestions),
  );
  editor = editablePopupInputReducer(
    editor,
    view.selectable.length === 0
      ? { kind: 'dismiss', reason: 'programmatic' }
      : { kind: 'open' },
    commandEditorOptions(suggestions),
  );
  return { ...state, suggestions, editor };
}

function acceptedSuggestion(
  state: CommandInputState
): ListboxViewEntry<CommandCompletion> | undefined {
  const view = createListboxView(state.suggestions);
  if (state.editor.activeId === undefined) return view.selectable[0];
  const record = collectionItemById(view.source, state.editor.activeId);
  if (record?.option.disabled !== false) return undefined;
  const position = collectionInteractionPosition(view.interactionIndex, record.id);
  return position === undefined ? undefined : view.selectable[position];
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
  suggestions: ListboxCollection<CommandCompletion>,
) {
  const index = createListboxView(suggestions).interactionIndex;
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
