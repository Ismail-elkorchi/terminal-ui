import {
  normalizeTextCaret,
  normalizeTextDocumentSelectionModel,
  textDocumentEdit,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentSelectionRange
} from './document.ts';
import { createTerminalTextIndex } from './terminal-text-index.ts';
import {
  nextGraphemeBoundary,
  previousGraphemeBoundary
} from './selection-model.ts';
import { nextWordBoundary, previousWordBoundary } from './word-boundaries.ts';
import type {
  TextCaret,
  TextDocumentSelection,
  TextEditOperation,
  TextPosition
} from './types.ts';
import type { TextDocument } from './document.ts';

const PAGE_LINE_DELTA = 10;

export interface TextDocumentEditState {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
}

export interface TextDocumentEditResult extends TextDocumentEditState {
  readonly changedRange?: { readonly start: number; readonly oldEnd: number; readonly newEnd: number };
}

export function editTextDocument(
  state: TextDocumentEditState,
  operation: TextEditOperation
): TextDocumentEditResult {
  const caret = normalizeTextCaret(state.document, state.caret);
  const selection = normalizeTextDocumentSelectionModel(state.document, state.selection);
  switch (operation.kind) {
    case 'insert':
    case 'replaceSelection':
      return replaceRange(state, caret, selection, operation.text);
    case 'deleteBackward': {
      if (selection !== undefined) return replaceRange(state, caret, selection, '');
      if (caret.position.offset === 0) return unchanged(state, caret, selection);
      const line = lineContaining(state.document, caret.position.offset);
      const local = caret.position.offset - line.start;
      const previous = line.start + previousGraphemeBoundary(line.text, local);
      return replaceOffsets(state, previous, caret.position.offset, '');
    }
    case 'deleteForward': {
      if (selection !== undefined) return replaceRange(state, caret, selection, '');
      if (caret.position.offset >= textDocumentLength(state.document)) return unchanged(state, caret, selection);
      const line = lineContaining(state.document, caret.position.offset);
      if (caret.position.offset === line.end && line.index < textDocumentLineCount(state.document) - 1) {
        return replaceOffsets(state, caret.position.offset, caret.position.offset + 1, '');
      }
      const local = caret.position.offset - line.start;
      return replaceOffsets(state, caret.position.offset, line.start + nextGraphemeBoundary(line.text, local), '');
    }
    case 'deleteWordBackward':
      if (selection !== undefined) return replaceRange(state, caret, selection, '');
      return replaceOffsets(state, previousWordOffset(state.document, caret.position.offset), caret.position.offset, '');
    case 'deleteWordForward':
      if (selection !== undefined) return replaceRange(state, caret, selection, '');
      return replaceOffsets(state, caret.position.offset, nextWordOffset(state.document, caret.position.offset), '');
    case 'moveLeft':
      return move(state, caret, selection, leftOffset(state.document, caret, selection, operation.select), 'upstream', operation.select);
    case 'moveRight':
      return move(state, caret, selection, rightOffset(state.document, caret, selection, operation.select), 'downstream', operation.select);
    case 'moveWordLeft':
      return move(state, caret, selection, previousWordOffset(state.document, caret.position.offset), 'upstream', operation.select);
    case 'moveWordRight':
      return move(state, caret, selection, nextWordOffset(state.document, caret.position.offset), 'downstream', operation.select);
    case 'moveHome': {
      const line = lineContaining(state.document, caret.position.offset);
      return move(state, caret, selection, line.start, 'downstream', operation.select);
    }
    case 'moveEnd': {
      const line = lineContaining(state.document, caret.position.offset);
      return move(state, caret, selection, line.end, 'upstream', operation.select);
    }
    case 'moveLineUp':
      return moveByLine(state, caret, selection, -1, operation.select);
    case 'moveLineDown':
      return moveByLine(state, caret, selection, 1, operation.select);
    case 'movePageUp':
      return moveByLine(state, caret, selection, -PAGE_LINE_DELTA, operation.select);
    case 'movePageDown':
      return moveByLine(state, caret, selection, PAGE_LINE_DELTA, operation.select);
    case 'selectAll': {
      const length = textDocumentLength(state.document);
      if (length === 0) return unchanged(state, caret, selection);
      const nextCaret = caretAt(length, 'upstream');
      return stateResult(state.document, nextCaret, {
        anchor: positionAt(0, 'downstream'),
        focus: nextCaret.position
      });
    }
  }
}

function replaceRange(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  insertion: string
): TextDocumentEditResult {
  const range = textDocumentSelectionRange(state.document, selection, caret);
  return replaceOffsets(state, range.start, range.end, insertion);
}

function replaceOffsets(
  state: TextDocumentEditState,
  start: number,
  end: number,
  insertion: string
): TextDocumentEditResult {
  const change = textDocumentEdit(state.document, { start, end }, insertion);
  const offset = change.replaced.start + change.insertedLength;
  const nextCaret = caretAt(offset, 'downstream');
  if (change.document === state.document && sameCaret(nextCaret, state.caret) && state.selection === undefined) {
    return state;
  }
  return {
    document: change.document,
    caret: nextCaret,
    changedRange: {
      start: change.replaced.start,
      oldEnd: change.replaced.end,
      newEnd: offset
    }
  };
}

function move(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  offset: number,
  affinity: TextPosition['affinity'],
  selecting: boolean | undefined,
  preferredColumnCells?: number
): TextDocumentEditResult {
  const nextCaret: TextCaret = Object.freeze({
    position: positionAt(offset, affinity),
    ...(preferredColumnCells === undefined ? {} : { preferredColumnCells })
  });
  if (selecting !== true) return stateResult(state.document, nextCaret, undefined, state);
  const anchor = selectionAnchor(selection, caret);
  const nextSelection = normalizeTextDocumentSelectionModel(state.document, { anchor, focus: nextCaret.position });
  return stateResult(state.document, nextCaret, nextSelection, state);
}

function moveByLine(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  delta: number,
  selecting: boolean | undefined
): TextDocumentEditResult {
  const current = lineContaining(state.document, caret.position.offset);
  const currentIndex = createTerminalTextIndex(current.text);
  const local = Math.max(0, Math.min(current.text.length, caret.position.offset - current.start));
  const preferred = caret.preferredColumnCells
    ?? currentIndex.graphemeIndexToVisualColumn(currentIndex.codeUnitOffsetToGraphemeIndex(local));
  const targetIndex = Math.max(0, Math.min(textDocumentLineCount(state.document) - 1, current.index + delta));
  const target = textDocumentLineAt(state.document, targetIndex) ?? current;
  const targetText = createTerminalTextIndex(target.text);
  const grapheme = targetText.visualColumnToGraphemeIndex(preferred);
  const offset = target.start + targetText.graphemeIndexToCodeUnitOffset(grapheme);
  return move(state, caret, selection, offset, 'downstream', selecting, preferred);
}

function leftOffset(
  document: TextDocument,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  selecting: boolean | undefined
): number {
  const range = textDocumentSelectionRange(document, selection, caret);
  if (selecting !== true && selection !== undefined) return range.start;
  const line = lineContaining(document, caret.position.offset);
  if (caret.position.offset === line.start && line.index > 0) return caret.position.offset - 1;
  return line.start + previousGraphemeBoundary(line.text, caret.position.offset - line.start);
}

function rightOffset(
  document: TextDocument,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  selecting: boolean | undefined
): number {
  const range = textDocumentSelectionRange(document, selection, caret);
  if (selecting !== true && selection !== undefined) return range.end;
  const line = lineContaining(document, caret.position.offset);
  if (caret.position.offset === line.end && line.index < textDocumentLineCount(document) - 1) {
    return caret.position.offset + 1;
  }
  return line.start + nextGraphemeBoundary(line.text, caret.position.offset - line.start);
}

function previousWordOffset(document: TextDocument, offset: number): number {
  const line = lineContaining(document, offset);
  if (offset === line.start && line.index > 0) return offset - 1;
  return line.start + previousWordBoundary(line.text, offset - line.start);
}

function nextWordOffset(document: TextDocument, offset: number): number {
  const line = lineContaining(document, offset);
  if (offset === line.end && line.index < textDocumentLineCount(document) - 1) return offset + 1;
  return line.start + nextWordBoundary(line.text, offset - line.start);
}

function lineContaining(document: TextDocument, offset: number): NonNullable<ReturnType<typeof textDocumentLineAt>> {
  const index = textDocumentLineIndexAtOffset(document, offset);
  const line = textDocumentLineAt(document, index);
  if (line === undefined) throw new Error('Text document line index is inconsistent.');
  return line;
}

function selectionAnchor(selection: TextDocumentSelection | undefined, caret: TextCaret): TextPosition {
  if (selection === undefined) return caret.position;
  return selection.focus.offset === caret.position.offset ? selection.anchor : selection.focus;
}

function stateResult(
  document: TextDocument,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  previous?: TextDocumentEditState
): TextDocumentEditResult {
  if (
    previous?.document === document
    && sameCaret(previous.caret, caret)
    && sameSelection(previous.selection, selection)
  ) return previous;
  return { document, caret, ...(selection === undefined ? {} : { selection }) };
}

function unchanged(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined
): TextDocumentEditResult {
  return stateResult(state.document, caret, selection, state);
}

function caretAt(offset: number, affinity: TextPosition['affinity']): TextCaret {
  return Object.freeze({ position: positionAt(offset, affinity) });
}

function positionAt(offset: number, affinity: TextPosition['affinity']): TextPosition {
  return Object.freeze({ offset: Math.max(0, Math.floor(offset)), affinity });
}

function sameCaret(left: TextCaret, right: TextCaret): boolean {
  return left.position.offset === right.position.offset
    && left.position.affinity === right.position.affinity
    && left.preferredColumnCells === right.preferredColumnCells;
}

function sameSelection(left: TextDocumentSelection | undefined, right: TextDocumentSelection | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.anchor.offset === right.anchor.offset
    && left.anchor.affinity === right.anchor.affinity
    && left.focus.offset === right.focus.offset
    && left.focus.affinity === right.focus.affinity;
}
