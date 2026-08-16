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
  CommandCompletion,
  CommandInputTransition,
  CommandSuggestion
} from '../ui-model/command-input.ts';
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
import { collectionInteractionPosition } from '../interaction/collection.ts';

const DEFAULT_SUBMISSION_LIMIT = 100;

export interface CommandInputState {
  readonly editor: EditablePopupInputState;
  readonly submissions: readonly string[];
  readonly submissionLimit: number;
  readonly draft?: TextEditBuffer;
  readonly submissionIndex?: number;
  readonly suggestions: ListboxCollection<CommandCompletion>;
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
  const suggestions = prepareListboxView(input.suggestions);
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
  action: CommandInputTransition
): CommandInputState {
  switch (action.kind) {
    case 'edit':
      return applyCommandTransition(state, action);
    case 'undo':
    case 'redo':
    case 'pointer':
      return applyCommandTransition(state, action);
    case 'setValue':
      return applyCommandTransition(state, { kind: 'setText', value: action.value });
    case 'recordSubmission':
      return recordSubmission(state, action.value);
    case 'setSuggestions':
      return setCommandSuggestions(state, action.suggestions);
    case 'historyPrevious':
      return commandInputHistory(state, -1);
    case 'historyNext':
      return commandInputHistory(state, 1);
    case 'moveSuggestion':
      return applyCommandTransition(state, { kind: 'moveActive', delta: action.delta });
    case 'setActiveSuggestion':
      return applyCommandTransition(state, { kind: 'setActive', id: action.id });
    case 'acceptSuggestion': {
      const suggestion = acceptedSuggestion(state);
      if (suggestion === undefined || suggestion.item.disabled) return state;
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
          { kind: 'dismiss', reason: action.reason },
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
      }, prepareListboxView(state.suggestions).interactionIndex),
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
    }, prepareListboxView(state.suggestions).interactionIndex),
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
    }, prepareListboxView(state.suggestions).interactionIndex),
    submissions
  });
}

function setCommandSuggestions(
  state: CommandInputState,
  suggestions: ListboxCollection<CommandCompletion>,
): CommandInputState {
  const view = prepareListboxView(suggestions);
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
  const view = prepareListboxView(state.suggestions);
  if (state.editor.activeId === undefined) return view.selectable[0];
  const record = collectionRecordById(view.source, state.editor.activeId);
  if (record?.item.disabled !== false) return undefined;
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
  const index = prepareListboxView(suggestions).interactionIndex;
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

export function prepareCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
): CompleteListboxCollection<CommandCompletion>;
export function prepareCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
  window: CollectionWindow,
): WindowedListboxCollection<CommandCompletion>;
export function prepareCommandSuggestions(
  suggestions: readonly CommandSuggestion[],
  window?: CollectionWindow,
): ListboxCollection<CommandCompletion> {
  const values = suggestions.map((suggestion) => ownCompletion(suggestion.completion));
  const startIndex = window?.startIndex ?? 0;
  const projector = (_value: CommandCompletion, itemIndex: number) => {
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
    ? prepareListboxCollection(values, projector)
    : prepareListboxCollection(values, projector, window);
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
