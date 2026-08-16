import {
  applyTextEditWithHistory,
  breakTextEditHistoryGroup,
  emptyTextEditHistory,
  normalizeTextCursor,
  sanitizeTerminalText,
} from '../text/index.ts';
import type {
  EditHistoryPolicy,
  TextEditBuffer,
  TextEditHistory,
  TextEditOperation,
  TextSelection,
} from '../text/index.ts';
import {
  collectionInteractionHas,
  collectionInteractionIds,
  collectionInteractionPosition,
} from './collection.ts';
import type { CollectionInteractionIndex } from './collection.ts';
import { adjacentItemId } from './navigation.ts';
import type { NavigationPolicy } from './navigation.ts';
import { popupReducer } from './popup.ts';
import type { AnchoredSurfaceDismissReason } from './anchored-surface.ts';
import type { TextPointerAction } from './text-pointer.ts';

export interface EditablePopupCompletion {
  readonly range: TextSelection;
  readonly text: string;
}

export interface EditablePopupInputState {
  readonly input: TextEditBuffer;
  readonly editHistory: TextEditHistory;
  readonly open: boolean;
  readonly activeId?: string;
}

export interface CreateEditablePopupInputStateInput {
  readonly value?: string;
  readonly cursor?: number;
  readonly open?: boolean;
  readonly activeId?: string;
  readonly editHistoryPolicy?: EditHistoryPolicy;
}

export type EditablePopupInputTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'setText'; readonly value: string }
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' };

export interface EditablePopupInputReducerOptions {
  readonly indexForText: (text: string) => CollectionInteractionIndex;
  readonly navigation?: NavigationPolicy;
  readonly openOnEdit?: boolean;
}

export function createEditablePopupInputState(
  input: CreateEditablePopupInputStateInput,
  index: CollectionInteractionIndex,
): EditablePopupInputState {
  const value = sanitizeTerminalText(input.value ?? '').text;
  const activeId = input.activeId !== undefined && collectionInteractionHas(index, input.activeId)
    ? input.activeId
    : undefined;
  return Object.freeze({
    input: Object.freeze({
      text: value,
      cursor: normalizeTextCursor(value, input.cursor ?? value.length),
    }),
    editHistory: emptyTextEditHistory(input.editHistoryPolicy),
    open: input.open ?? false,
    ...(activeId === undefined ? {} : { activeId }),
  });
}

export function editablePopupInputReducer(
  state: EditablePopupInputState,
  transition: EditablePopupInputTransition,
  options: EditablePopupInputReducerOptions,
): EditablePopupInputState {
  switch (transition.kind) {
    case 'edit':
      return updateText(state, transition.operation, options);
    case 'undo':
    case 'redo':
      return updateHistory(state, transition, options);
    case 'pointer': {
      const input = pointerBuffer(state.input, transition.action);
      const editHistory = breakTextEditHistoryGroup(state.editHistory);
      return input === state.input && editHistory === state.editHistory
        ? state
        : { ...state, input, editHistory };
    }
    case 'setText':
      return updateText(state, {
        kind: 'replaceRange',
        range: { startOffset: 0, endOffsetExclusive: state.input.text.length },
        text: transition.value,
      }, options);
    case 'open':
    case 'toggle': {
      const popup = popupReducer(state, transition);
      const open = popup.open;
      const index = options.indexForText(state.input.text);
      const activeId = open ? validOrFirst(index, state.activeId) : state.activeId;
      return open === state.open && activeId === state.activeId
        ? state
        : stateValue(state, state.input, state.editHistory, open, activeId);
    }
    case 'dismiss': {
      const open = popupReducer(state, transition).open;
      return open === state.open ? state : stateValue(
        state,
        state.input,
        breakTextEditHistoryGroup(state.editHistory),
        open,
        state.activeId,
      );
    }
    case 'setActive': {
      const index = options.indexForText(state.input.text);
      const activeId = transition.id !== undefined && collectionInteractionHas(index, transition.id)
        ? transition.id
        : undefined;
      return activeId === state.activeId ? state : stateValue(
        state,
        state.input,
        state.editHistory,
        state.open,
        activeId,
      );
    }
    case 'moveActive': {
      const index = options.indexForText(state.input.text);
      const activeId = adjacentItemId(
        collectionInteractionIds(index),
        state.activeId,
        transition.delta,
        options.navigation,
      );
      return stateValue(state, state.input, state.editHistory, true, activeId);
    }
    case 'firstActive': {
      const activeId = collectionInteractionIds(options.indexForText(state.input.text))[0];
      return stateValue(state, state.input, state.editHistory, true, activeId);
    }
    case 'lastActive': {
      const activeId = collectionInteractionIds(options.indexForText(state.input.text)).at(-1);
      return stateValue(state, state.input, state.editHistory, true, activeId);
    }
  }
}

export function acceptEditablePopupCompletion(
  state: EditablePopupInputState,
  completion: EditablePopupCompletion,
  options: EditablePopupInputReducerOptions,
): EditablePopupInputState {
  const edited = updateText(state, {
    kind: 'replaceRange',
    range: completion.range,
    text: completion.text,
  }, { ...options, openOnEdit: false });
  return stateValue(
    edited,
    edited.input,
    edited.editHistory,
    false,
    edited.activeId,
  );
}

function updateText(
  state: EditablePopupInputState,
  operation: TextEditOperation,
  options: EditablePopupInputReducerOptions,
): EditablePopupInputState {
  const edited = applyTextEditWithHistory(state.input, state.editHistory, operation);
  if (edited.buffer === state.input && edited.history === state.editHistory) return state;
  const textChanged = edited.buffer.text !== state.input.text;
  const index = options.indexForText(edited.buffer.text);
  const activeId = textChanged ? collectionInteractionIds(index)[0] : validActive(index, state.activeId);
  const open = textChanged && options.openOnEdit !== false ? true : state.open;
  return stateValue(state, edited.buffer, edited.history, open, activeId);
}

function updateHistory(
  state: EditablePopupInputState,
  transition: { readonly kind: 'undo' | 'redo' },
  options: EditablePopupInputReducerOptions,
): EditablePopupInputState {
  const edited = applyTextEditWithHistory(state.input, state.editHistory, transition);
  if (edited.buffer === state.input && edited.history === state.editHistory) return state;
  const index = options.indexForText(edited.buffer.text);
  return stateValue(
    state,
    edited.buffer,
    edited.history,
    state.open,
    validOrFirst(index, state.activeId),
  );
}

function pointerBuffer(buffer: TextEditBuffer, action: TextPointerAction): TextEditBuffer {
  const offset = normalizeTextCursor(buffer.text, action.offset);
  if (action.kind === 'placeCaret') {
    if (offset === buffer.cursor && buffer.selection === undefined) return buffer;
    return Object.freeze({ text: buffer.text, cursor: offset });
  }
  const anchor = normalizeTextCursor(buffer.text, action.anchor);
  const startOffset = Math.min(anchor, offset);
  const endOffsetExclusive = Math.max(anchor, offset);
  return Object.freeze({
    text: buffer.text,
    cursor: offset,
    ...(startOffset === endOffsetExclusive
      ? {}
      : { selection: Object.freeze({ startOffset, endOffsetExclusive }) }),
  });
}

function validOrFirst(
  index: CollectionInteractionIndex,
  activeId: string | undefined,
): string | undefined {
  return validActive(index, activeId) ?? collectionInteractionIds(index)[0];
}

function validActive(
  index: CollectionInteractionIndex,
  activeId: string | undefined,
): string | undefined {
  if (activeId === undefined) return undefined;
  return collectionInteractionPosition(index, activeId) === undefined ? undefined : activeId;
}

function stateValue(
  previous: EditablePopupInputState,
  input: TextEditBuffer,
  editHistory: TextEditHistory,
  open: boolean,
  activeId: string | undefined,
): EditablePopupInputState {
  if (
    input === previous.input
    && editHistory === previous.editHistory
    && open === previous.open
    && activeId === previous.activeId
  ) return previous;
  return Object.freeze({
    input,
    editHistory,
    open,
    ...(activeId === undefined ? {} : { activeId }),
  });
}
