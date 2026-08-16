import { applyScrollEvent } from './scroll.ts';
import {
  breakEditHistoryGroup,
  createBoundedEditHistory,
  recordEditHistory,
  redoEditHistory,
  undoEditHistory
} from '../text/bounded-history.ts';
import {
  editTextDocument,
  editTextBuffer,
  normalizeTextCaret,
  normalizeTextCursor,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelectionModel,
  normalizeTextSelection,
  prepareTextDocument,
  textCaretAt,
  textDocumentSelectionBetween
} from '../text/index.ts';
import type {
  BoundedEditHistory,
  EditHistoryPolicy,
  TextCaret,
  TextDocument,
  TextDocumentSelection,
  TextEditBuffer,
  TextSelection
} from '../text/index.ts';
import { textDocumentBytes } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TextAreaAction } from '../ui-model/text-area.ts';
import type { TextInputAction, TextInputPresentation } from '../ui-model/text-input.ts';

export interface TextAreaState {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll: ScrollState;
  readonly revealCaret: boolean;
  readonly history: TextAreaEditHistory;
}

export interface TextAreaEditSnapshot {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
}

export type TextAreaEditHistory = BoundedEditHistory<TextAreaEditSnapshot, 'insert'>;

export interface CreateTextAreaStateInput {
  readonly value: string;
  readonly caret?: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll: ScrollState;
  readonly historyPolicy?: EditHistoryPolicy;
}

export function createTextAreaState(input: CreateTextAreaStateInput): TextAreaState {
  const document = prepareTextDocument(input.value);
  const caret = normalizeTextCaret(document, input.caret ?? textCaretAt(0));
  const selection = normalizeTextDocumentSelectionModel(document, input.selection);
  return {
    document,
    caret,
    ...(selection === undefined ? {} : { selection }),
    scroll: input.scroll,
    revealCaret: true,
    history: createBoundedEditHistory(input.historyPolicy)
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
  if (action.kind === 'edit') return editTextBuffer(state, action.operation);
  if (action.kind === 'pointer') return applyTextPointerAction(state, action.action);
  return state;
}

export function textAreaReducer(state: TextAreaState, action: TextAreaAction): TextAreaState {
  switch (action.kind) {
    case 'edit': {
      const edited = editTextDocument(state, action.operation);
      if (edited === state) return state;
      const textChanged = edited.document !== state.document;
      const group = action.operation.kind === 'insert' && state.selection === undefined
        ? 'insert' as const
        : undefined;
      return {
        document: edited.document,
        caret: edited.caret,
        ...(edited.selection === undefined ? {} : { selection: edited.selection }),
        scroll: state.scroll,
        revealCaret: true,
        history: textChanged
          ? recordEditHistory(
              state.history,
              textAreaSnapshot(state),
              textAreaSnapshotBytes(state),
              group
            )
          : breakEditHistoryGroup(state.history)
      };
    }
    case 'undo':
      return restoreTextAreaHistory(state, 'undo');
    case 'redo':
      return restoreTextAreaHistory(state, 'redo');
    case 'pointer': {
      const offset = normalizeTextDocumentOffset(state.document, action.action.offset);
      if (action.action.kind === 'placeCaret') {
        return textAreaStateWithSelection(breakTextAreaHistoryGroup(state), {
          caret: textCaretAt(offset),
          revealCaret: true
        }, undefined);
      }
      const anchor = normalizeTextDocumentOffset(state.document, action.action.anchor);
      const selection = normalizeTextDocumentSelectionModel(
        state.document,
        textDocumentSelectionBetween(anchor, offset)
      );
      return textAreaStateWithSelection(breakTextAreaHistoryGroup(state), {
        caret: textCaretAt(offset),
        revealCaret: true
      }, selection);
    }
    case 'scroll': {
      const scroll = applyScrollEvent(state.scroll, action.event);
      if (scroll === state.scroll && !state.revealCaret) return state;
      return { ...state, scroll, revealCaret: false };
    }
  }
}

function breakTextAreaHistoryGroup(state: TextAreaState): TextAreaState {
  const history = breakEditHistoryGroup(state.history);
  return history === state.history ? state : { ...state, history };
}

function textAreaStateWithSelection(
  state: TextAreaState,
  changes: Partial<Pick<TextAreaState, 'document' | 'caret' | 'scroll' | 'revealCaret'>>,
  selection: TextDocumentSelection | undefined
): TextAreaState {
  const nextDocument = changes.document ?? state.document;
  const nextCaret = changes.caret ?? state.caret;
  const nextScroll = changes.scroll ?? state.scroll;
  const nextRevealCaret = changes.revealCaret ?? state.revealCaret;
  if (
    nextDocument === state.document
    && sameTextCaret(nextCaret, state.caret)
    && nextScroll === state.scroll
    && nextRevealCaret === state.revealCaret
    && sameDocumentSelection(selection, state.selection)
  ) return state;
  const { selection: previousSelection, ...base } = state;
  void previousSelection;
  return {
    ...base,
    ...changes,
    ...(selection === undefined ? {} : { selection })
  };
}

function restoreTextAreaHistory(
  state: TextAreaState,
  direction: 'undo' | 'redo'
): TextAreaState {
  const current = textAreaSnapshot(state);
  const transition = direction === 'undo'
    ? undoEditHistory(state.history, current, textAreaSnapshotBytes(state))
    : redoEditHistory(state.history, current, textAreaSnapshotBytes(state));
  if (transition.snapshot === undefined) {
    return transition.history === state.history ? state : { ...state, history: transition.history };
  }
  return {
    ...transition.snapshot,
    scroll: state.scroll,
    revealCaret: true,
    history: transition.history
  };
}

function textAreaSnapshot(state: TextAreaState): TextAreaEditSnapshot {
  return Object.freeze({
    document: state.document,
    caret: state.caret,
    ...(state.selection === undefined ? {} : { selection: state.selection })
  });
}

function textAreaSnapshotBytes(state: TextAreaState): number {
  return textDocumentBytes(state.document) + 32;
}

function sameTextCaret(left: TextCaret, right: TextCaret): boolean {
  return left.position.offset === right.position.offset
    && left.position.affinity === right.position.affinity
    && left.preferredColumnCells === right.preferredColumnCells;
}

function sameDocumentSelection(
  left: TextDocumentSelection | undefined,
  right: TextDocumentSelection | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.anchor.offset === right.anchor.offset
    && left.anchor.affinity === right.anchor.affinity
    && left.focus.offset === right.focus.offset
    && left.focus.affinity === right.focus.affinity;
}

export function applyTextPointerAction(
  state: TextEditBuffer,
  action: TextPointerAction
): TextEditBuffer {
  const offset = normalizeTextCursor(state.text, action.offset);
  if (action.kind === 'placeCaret') return { text: state.text, cursor: offset };
  const anchor = normalizeTextCursor(state.text, action.anchor);
  const selection = normalizeTextSelection(state.text, {
    startOffset: anchor,
    endOffsetExclusive: offset
  });
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
  return start === end
    ? undefined
    : { startOffset: start, endOffsetExclusive: end };
}
