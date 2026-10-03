import { finishWork } from '../foundation/cooperative-work.ts';
import { sameDocumentSelection, sameTextCaret } from './comparison.ts';
import type { TextDocument } from './document.ts';
import {
  normalizeTextCaretWork,
  normalizeTextDocumentSelectionWork,
  textDocumentEditWork,
  textDocumentLength,
  textDocumentLineAtWork,
  textDocumentLineBoundaries,
  textDocumentLineCount,
  textDocumentLineIndexAtOffsetWork,
  textDocumentSelectionRange,
} from './document.ts';
import { sourceGeometry } from './source-geometry.ts';
import { nextSourceBoundary, previousSourceBoundary } from './text-range.ts';
import type {
  TextCaret,
  TextDocumentSelection,
  TextEditOperation,
  TextIndexOptions,
  TextPosition,
} from './types.ts';
import { ownedWordBoundaryIndex } from './word-boundaries.ts';

export interface TextDocumentEditState {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
}

export interface TextDocumentEditResult extends TextDocumentEditState {
  readonly changedRange?: {
    readonly startOffset: number;
    readonly oldEndOffsetExclusive: number;
    readonly newEndOffsetExclusive: number;
  };
}

export function editTextDocument(
  state: TextDocumentEditState,
  operation: TextEditOperation,
  options: TextIndexOptions = {}
): TextDocumentEditResult {
  return finishWork(editTextDocumentWork(state, operation, options));
}

export function* editTextDocumentWork(
  state: TextDocumentEditState,
  operation: TextEditOperation,
  options: TextIndexOptions = {},
): Generator<number, TextDocumentEditResult> {
  const caret = yield* normalizeTextCaretWork(state.document, state.caret);
  const selection = yield* normalizeTextDocumentSelectionWork(state.document, state.selection);
  switch (operation.kind) {
    case 'insert':
    case 'replaceSelection':
      return yield* replaceRangeWork(state, caret, selection, operation.text);
    case 'replaceRange':
      return yield* replaceOffsetsWork(
        state,
        operation.range.startOffset,
        operation.range.endOffsetExclusive,
        operation.text
      );
    case 'deleteBackward': {
      if (selection !== undefined) return yield* replaceRangeWork(state, caret, selection, '');
      if (caret.position.offset === 0) return unchanged(state, caret, selection);
      const line = yield* lineContainingWork(state.document, caret.position.offset);
      if (caret.position.offset === line.startOffset && line.lineIndex > 0) {
        const previousLine = yield* textDocumentLineAtWork(state.document, line.lineIndex - 1);
        if (previousLine !== undefined) {
          return yield* replaceOffsetsWork(
            state,
            previousLine.endOffsetExclusive,
            line.startOffset,
            '',
          );
        }
      }
      const local = caret.position.offset - line.startOffset;
      const previous = line.startOffset + previousSourceBoundary(textDocumentLineBoundaries(state.document, line), local);
      return yield* replaceOffsetsWork(state, previous, caret.position.offset, '');
    }
    case 'deleteForward': {
      if (selection !== undefined) return yield* replaceRangeWork(state, caret, selection, '');
      if (caret.position.offset >= textDocumentLength(state.document)) return unchanged(state, caret, selection);
      const line = yield* lineContainingWork(state.document, caret.position.offset);
      if (caret.position.offset === line.endOffsetExclusive
        && line.lineIndex < textDocumentLineCount(state.document) - 1) {
        const nextLine = yield* textDocumentLineAtWork(state.document, line.lineIndex + 1);
        return nextLine === undefined
          ? unchanged(state, caret, selection)
          : yield* replaceOffsetsWork(state, caret.position.offset, nextLine.startOffset, '');
      }
      const local = caret.position.offset - line.startOffset;
      return yield* replaceOffsetsWork(state, caret.position.offset, line.startOffset + nextSourceBoundary(textDocumentLineBoundaries(state.document, line), local), '');
    }
    case 'deleteWordBackward':
      if (selection !== undefined) return yield* replaceRangeWork(state, caret, selection, '');
      return yield* replaceOffsetsWork(
        state,
        yield* previousWordOffsetWork(state.document, caret.position.offset, options),
        caret.position.offset,
        ''
      );
    case 'deleteWordForward':
      if (selection !== undefined) return yield* replaceRangeWork(state, caret, selection, '');
      return yield* replaceOffsetsWork(
        state,
        caret.position.offset,
        yield* nextWordOffsetWork(state.document, caret.position.offset, options),
        ''
      );
    case 'moveLeft':
      return yield* moveWork(state, caret, selection, yield* leftOffsetWork(state.document, caret, selection, operation.extendSelection), 'upstream', operation.extendSelection);
    case 'moveRight':
      return yield* moveWork(state, caret, selection, yield* rightOffsetWork(state.document, caret, selection, operation.extendSelection), 'downstream', operation.extendSelection);
    case 'moveWordLeft':
      return yield* moveWork(
        state,
        caret,
        selection,
        yield* previousWordOffsetWork(state.document, caret.position.offset, options),
        'upstream',
        operation.extendSelection
      );
    case 'moveWordRight':
      return yield* moveWork(
        state,
        caret,
        selection,
        yield* nextWordOffsetWork(state.document, caret.position.offset, options),
        'downstream',
        operation.extendSelection
      );
    case 'moveHome': {
      const line = yield* lineContainingWork(state.document, caret.position.offset);
      return yield* moveWork(state, caret, selection, line.startOffset, 'downstream', operation.extendSelection);
    }
    case 'moveEnd': {
      const line = yield* lineContainingWork(state.document, caret.position.offset);
      return yield* moveWork(state, caret, selection, line.endOffsetExclusive, 'upstream', operation.extendSelection);
    }
    case 'moveLineUp':
      return yield* moveByLineWork(state, caret, selection, -1, operation.extendSelection, options);
    case 'moveLineDown':
      return yield* moveByLineWork(state, caret, selection, 1, operation.extendSelection, options);
    case 'moveDocumentStart':
      return yield* moveWork(state, caret, selection, 0, 'downstream', operation.extendSelection);
    case 'moveDocumentEnd':
      return yield* moveWork(state, caret, selection, textDocumentLength(state.document), 'upstream', operation.extendSelection);
    case 'moveTo': {
      const target = yield* normalizeTextCaretWork(state.document, operation.caret);
      return yield* moveWork(state, caret, selection, target.position.offset, target.position.affinity,
        operation.extendSelection, target.preferredColumnCells);
    }
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

function* replaceRangeWork(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  insertion: string
): Generator<number, TextDocumentEditResult> {
  const range = textDocumentSelectionRange(state.document, selection, caret);
  return yield* replaceOffsetsWork(state, range.startOffset, range.endOffsetExclusive, insertion);
}

function* replaceOffsetsWork(
  state: TextDocumentEditState,
  startOffset: number,
  endOffsetExclusive: number,
  insertion: string
): Generator<number, TextDocumentEditResult> {
  const change = yield* textDocumentEditWork(state.document, { startOffset, endOffsetExclusive }, insertion);
  const offset = change.replaced.startOffset + change.insertedLength;
  let nextCaret = yield* normalizeTextCaretWork(change.document, caretAt(offset, 'downstream'));
  if (nextCaret.position.offset !== offset) {
    nextCaret = caretAt(yield* rightOffsetWork(change.document, nextCaret, undefined, false), 'downstream');
  }
  if (change.document === state.document && sameTextCaret(nextCaret, state.caret) && state.selection === undefined) {
    return state;
  }
  return {
    document: change.document,
    caret: nextCaret,
    changedRange: {
      startOffset: change.replaced.startOffset,
      oldEndOffsetExclusive: change.replaced.endOffsetExclusive,
      newEndOffsetExclusive: offset
    }
  };
}

function* moveWork(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  offset: number,
  affinity: TextPosition['affinity'],
  selecting: boolean | undefined,
  preferredColumnCells?: number
): Generator<number, TextDocumentEditResult> {
  const nextCaret: TextCaret = Object.freeze({
    position: positionAt(offset, affinity),
    ...(preferredColumnCells === undefined ? {} : { preferredColumnCells })
  });
  if (selecting !== true) return stateResult(state.document, nextCaret, undefined, state);
  const anchor = selectionAnchor(selection, caret);
  const nextSelection = yield* normalizeTextDocumentSelectionWork(state.document, { anchor, focus: nextCaret.position });
  return stateResult(state.document, nextCaret, nextSelection, state);
}

function* moveByLineWork(
  state: TextDocumentEditState,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  delta: number,
  selecting: boolean | undefined,
  options: TextIndexOptions
): Generator<number, TextDocumentEditResult> {
  const current = yield* lineContainingWork(state.document, caret.position.offset);
  const local = caret.position.offset - current.startOffset;
  const currentGeometry = sourceGeometry(textDocumentLineBoundaries(state.document, current), options);
  if (caret.preferredColumnCells === undefined) yield* currentGeometry.prepareOffsetWork(local);
  const preferred = caret.preferredColumnCells ?? currentGeometry.columnAt(local);
  const targetIndex = Math.max(
    0,
    Math.min(textDocumentLineCount(state.document) - 1, current.lineIndex + delta)
  );
  const target = (yield* textDocumentLineAtWork(state.document, targetIndex)) ?? current;
  const targetGeometry = sourceGeometry(textDocumentLineBoundaries(state.document, target), options);
  yield* targetGeometry.prepareColumnWork(preferred);
  const offset = target.startOffset + targetGeometry.offsetAt(preferred);
  return yield* moveWork(state, caret, selection, offset, 'downstream', selecting, preferred);
}

function* leftOffsetWork(
  document: TextDocument,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  selecting: boolean | undefined
): Generator<number, number> {
  const range = textDocumentSelectionRange(document, selection, caret);
  if (selecting !== true && selection !== undefined) return range.startOffset;
  const line = yield* lineContainingWork(document, caret.position.offset);
  if (caret.position.offset === line.startOffset && line.lineIndex > 0) {
    return (yield* textDocumentLineAtWork(document, line.lineIndex - 1))?.endOffsetExclusive
      ?? caret.position.offset;
  }
  return line.startOffset + previousSourceBoundary(textDocumentLineBoundaries(document, line), caret.position.offset - line.startOffset);
}

function* rightOffsetWork(
  document: TextDocument,
  caret: TextCaret,
  selection: TextDocumentSelection | undefined,
  selecting: boolean | undefined
): Generator<number, number> {
  const range = textDocumentSelectionRange(document, selection, caret);
  if (selecting !== true && selection !== undefined) return range.endOffsetExclusive;
  const line = yield* lineContainingWork(document, caret.position.offset);
  if (caret.position.offset === line.endOffsetExclusive
    && line.lineIndex < textDocumentLineCount(document) - 1) {
    return (yield* textDocumentLineAtWork(document, line.lineIndex + 1))?.startOffset
      ?? caret.position.offset;
  }
  return line.startOffset + nextSourceBoundary(textDocumentLineBoundaries(document, line), caret.position.offset - line.startOffset);
}

function* previousWordOffsetWork(
  document: TextDocument,
  offset: number,
  options: TextIndexOptions
): Generator<number, number> {
  const line = yield* lineContainingWork(document, offset);
  if (offset === line.startOffset && line.lineIndex > 0) {
    return (yield* textDocumentLineAtWork(document, line.lineIndex - 1))?.endOffsetExclusive ?? offset;
  }
  const words = ownedWordBoundaryIndex(textDocumentLineBoundaries(document, line), options);
  yield* words.prepareThroughWork(offset - line.startOffset);
  return line.startOffset + words.previous(offset - line.startOffset);
}

function* nextWordOffsetWork(
  document: TextDocument,
  offset: number,
  options: TextIndexOptions
): Generator<number, number> {
  const line = yield* lineContainingWork(document, offset);
  if (offset === line.endOffsetExclusive
    && line.lineIndex < textDocumentLineCount(document) - 1) {
    return (yield* textDocumentLineAtWork(document, line.lineIndex + 1))?.startOffset ?? offset;
  }
  const words = ownedWordBoundaryIndex(textDocumentLineBoundaries(document, line), options);
  yield* words.prepareThroughWork(offset - line.startOffset);
  return line.startOffset + words.next(offset - line.startOffset);
}

function* lineContainingWork(document: TextDocument, offset: number): Generator<number, import('./document.ts').TextDocumentLine> {
  const index = yield* textDocumentLineIndexAtOffsetWork(document, offset);
  const line = yield* textDocumentLineAtWork(document, index);
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
    && sameTextCaret(previous.caret, caret)
    && sameDocumentSelection(previous.selection, selection)
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
