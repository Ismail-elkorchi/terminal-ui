import { applyScrollEvent } from './scroll.ts';
import {
  editTextBuffer,
  normalizeTextCursor,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelection,
  normalizeTextSelection,
  prepareTextDocument
} from '../text/index.ts';
import type { TextDocument, TextEditBuffer, TextSelection } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type {
  TextAreaAction,
  TextAreaScrollablePresentation
} from '../ui-model/text-area.ts';
import type { TextInputAction, TextInputPresentation } from '../ui-model/text-input.ts';

export interface TextAreaState {
  readonly document: TextDocument;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly scroll: ScrollState;
}

export interface CreateTextAreaStateInput {
  readonly value: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly scroll: ScrollState;
}

export function createTextAreaState(input: CreateTextAreaStateInput): TextAreaState {
  const document = prepareTextDocument(input.value);
  const cursor = normalizeTextDocumentOffset(document, input.cursor ?? 0);
  const selection = normalizeTextDocumentSelection(document, input.selection);
  return {
    document,
    cursor,
    ...(selection === undefined ? {} : { selection }),
    scroll: input.scroll
  };
}

export function textInputPresentation(state: TextEditBuffer): TextInputPresentation {
  const selection = normalizeTextSelection(state.text, state.selection);
  return {
    value: state.text,
    cursor: normalizeTextCursor(state.text, state.cursor),
    ...(selection === undefined ? {} : { selection })
  };
}

export function textInputReducer(state: TextEditBuffer, action: TextInputAction): TextEditBuffer {
  return action.kind === 'edit'
    ? editTextBuffer(state, action.operation)
    : applyTextPointerAction(state, action.action);
}

export function textAreaPresentation(state: TextAreaState): TextAreaScrollablePresentation {
  return {
    document: state.document,
    cursor: state.cursor,
    ...(state.selection === undefined ? {} : { selection: state.selection }),
    scroll: state.scroll
  };
}

export function textAreaReducer(state: TextAreaState, action: TextAreaAction): TextAreaState {
  switch (action.kind) {
    case 'edit': {
      const edited = editTextBuffer(textAreaEditBuffer(state), action.operation);
      return textAreaStateWithSelection(state, {
        document: edited.text === state.document.text ? state.document : prepareTextDocument(edited.text),
        cursor: edited.cursor
      }, edited.selection);
    }
    case 'pointer': {
      const offset = normalizeTextDocumentOffset(state.document, action.action.offset);
      if (action.action.kind === 'placeCaret') {
        return textAreaStateWithSelection(state, { cursor: offset }, undefined);
      }
      const anchor = normalizeTextDocumentOffset(state.document, action.action.anchor);
      const selection = normalizeTextDocumentSelection(state.document, { start: anchor, end: offset });
      return textAreaStateWithSelection(state, { cursor: offset }, selection);
    }
    case 'scroll':
      return { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
}

function textAreaStateWithSelection(
  state: TextAreaState,
  changes: Partial<Pick<TextAreaState, 'document' | 'cursor' | 'scroll'>>,
  selection: TextSelection | undefined
): TextAreaState {
  const { selection: previousSelection, ...base } = state;
  void previousSelection;
  return {
    ...base,
    ...changes,
    ...(selection === undefined ? {} : { selection })
  };
}

function textAreaEditBuffer(state: TextAreaState): TextEditBuffer {
  return {
    text: state.document.text,
    cursor: state.cursor,
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

export function applyTextPointerAction(
  state: TextEditBuffer,
  action: TextPointerAction
): TextEditBuffer {
  const offset = normalizeTextCursor(state.text, action.offset);
  if (action.kind === 'placeCaret') return { text: state.text, cursor: offset };
  const anchor = normalizeTextCursor(state.text, action.anchor);
  const selection = normalizeTextSelection(state.text, { start: anchor, end: offset });
  return {
    text: state.text,
    cursor: offset,
    ...(selection === undefined ? {} : { selection })
  };
}

export function selectionFromTextPointerAction(
  action: TextPointerAction
): TextSelection | undefined {
  if (action.kind === 'placeCaret') return undefined;
  const start = Math.max(0, Math.floor(Math.min(action.anchor, action.offset)));
  const end = Math.max(start, Math.floor(Math.max(action.anchor, action.offset)));
  return start === end ? undefined : { start, end };
}
