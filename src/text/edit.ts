import { sanitizeTerminalControlText, sanitizeTerminalSingleLineText } from './sanitize.ts';
import {
  nextGraphemeBoundary,
  normalizeTextCursor,
  normalizeTextEditCursor,
  normalizeTextSelection,
  previousGraphemeBoundary,
  replaceTextRange,
} from './text-range.ts';
import type {
  TextBoundaryOptions,
  TextEditBuffer,
  TextEditOperation,
  TextSelection,
} from './types.ts';
import type { WordBoundaryIndex } from './word-boundaries.ts';
import {
  lineEndOffset,
  lineOffsetByDelta,
  lineStartOffset,
  standaloneWordBoundaryIndex,
} from './word-boundaries.ts';

export function editTextBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
  options: TextBoundaryOptions = {}
): TextEditBuffer {
  return normalizeEditedBuffer(buffer, editBuffer(buffer, operation, options, (text) => sanitizeTerminalSingleLineText(text).text));
}

/** Source-backed text inputs defer tab expansion until the active display profile is known. */
export function editSourceTextBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
): TextEditBuffer {
  return normalizeEditedBuffer(buffer, editBuffer(buffer, operation, {}, sanitizeInsertedText));
}

function editBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
  options: TextBoundaryOptions,
  sanitizeInsertion: (text: string) => string,
): TextEditBuffer {
  const words = isWordOperation(operation) ? standaloneWordBoundaryIndex(buffer.text, options) : undefined;
  const cursor = normalizeTextCursor(buffer.text, buffer.cursor);
  const selection = normalizeTextSelection(buffer.text, buffer.selection);
  switch (operation.kind) {
    case 'insert': {
      return replaceTextRange(
        buffer.text,
        selectedRange(selection, cursor),
        sanitizeInsertion(operation.text)
      );
    }
    case 'replaceRange':
      return replaceTextRange(
        buffer.text,
        operation.range,
        sanitizeInsertion(operation.text)
      );
    case 'deleteBackward':
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      if (cursor === 0) return { ...buffer, cursor };
      {
        const previous = previousGraphemeBoundary(buffer.text, cursor);
        return {
          text: `${buffer.text.slice(0, previous)}${buffer.text.slice(cursor)}`,
          cursor: previous
        };
      }
    case 'deleteForward': {
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      if (cursor >= buffer.text.length) return { ...buffer, cursor };
      const next = nextGraphemeBoundary(buffer.text, cursor);
      return {
        text: `${buffer.text.slice(0, cursor)}${buffer.text.slice(next)}`,
        cursor
      };
    }
    case 'deleteWordBackward':
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      {
        const startOffset = requiredWordIndex(words).previous(cursor);
        return {
          text: `${buffer.text.slice(0, startOffset)}${buffer.text.slice(cursor)}`,
          cursor: startOffset
        };
      }
    case 'deleteWordForward':
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      return {
        text: `${buffer.text.slice(0, cursor)}${buffer.text.slice(
          requiredWordIndex(words).next(cursor)
        )}`,
        cursor
      };
    case 'moveLeft':
      return moveTo(buffer.text, cursor, selection, leftTarget(buffer.text, cursor, selection, operation.extendSelection), operation.extendSelection);
    case 'moveRight':
      return moveTo(buffer.text, cursor, selection, rightTarget(buffer.text, cursor, selection, operation.extendSelection), operation.extendSelection);
    case 'moveWordLeft':
      return moveTo(
        buffer.text,
        cursor,
        selection,
        wordLeftTarget(requiredWordIndex(words), cursor, selection, operation.extendSelection),
        operation.extendSelection
      );
    case 'moveWordRight':
      return moveTo(
        buffer.text,
        cursor,
        selection,
        wordRightTarget(requiredWordIndex(words), cursor, selection, operation.extendSelection),
        operation.extendSelection
      );
    case 'moveHome':
      return moveTo(buffer.text, cursor, selection, lineStartOffset(buffer.text, cursor), operation.extendSelection);
    case 'moveEnd':
      return moveTo(buffer.text, cursor, selection, lineEndOffset(buffer.text, cursor), operation.extendSelection);
    case 'moveLineUp':
      return moveTo(buffer.text, cursor, selection, lineOffsetByDelta(buffer.text, cursor, -1), operation.extendSelection);
    case 'moveLineDown':
      return moveTo(buffer.text, cursor, selection, lineOffsetByDelta(buffer.text, cursor, 1), operation.extendSelection);
    case 'moveDocumentStart':
      return moveTo(buffer.text, cursor, selection, 0, operation.extendSelection);
    case 'moveDocumentEnd':
      return moveTo(buffer.text, cursor, selection, buffer.text.length, operation.extendSelection);
    case 'moveTo':
      return moveTo(buffer.text, cursor, selection, operation.caret.position.offset, operation.extendSelection);
    case 'selectAll': {
      const normalized = normalizeTextSelection(buffer.text, { startOffset: 0, endOffsetExclusive: buffer.text.length });
      return {
        text: buffer.text,
        cursor: buffer.text.length,
        ...(normalized === undefined ? {} : { selection: normalized })
      };
    }
    case 'replaceSelection':
      return replaceTextRange(
        buffer.text,
        selectedRange(selection, cursor),
        sanitizeInsertion(operation.text)
      );
  }
}

function selectedRange(selection: TextSelection | undefined, cursor: number): TextSelection {
  return selection ?? { startOffset: cursor, endOffsetExclusive: cursor };
}

function moveTo(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  target: number,
  extendSelection: boolean | undefined
): TextEditBuffer {
  const nextCursor = normalizeTextCursor(text, target);
  if (extendSelection !== true) return { text, cursor: nextCursor };
  const anchor = selectionAnchor(selection, cursor);
  const nextSelection = normalizeTextSelection(text, { startOffset: anchor, endOffsetExclusive: nextCursor });
  return {
    text,
    cursor: nextCursor,
    ...(nextSelection === undefined ? {} : { selection: nextSelection })
  };
}

function selectionAnchor(selection: TextSelection | undefined, cursor: number): number {
  if (selection === undefined) return cursor;
  if (cursor <= selection.startOffset) return selection.endOffsetExclusive;
  if (cursor >= selection.endOffsetExclusive) return selection.startOffset;
  return selection.startOffset;
}

function leftTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  extendSelection: boolean | undefined
): number {
  if (extendSelection !== true && selection !== undefined) return selection.startOffset;
  return previousGraphemeBoundary(text, cursor);
}

function rightTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  extendSelection: boolean | undefined
): number {
  if (extendSelection !== true && selection !== undefined) return selection.endOffsetExclusive;
  return nextGraphemeBoundary(text, cursor);
}

function wordLeftTarget(
  index: WordBoundaryIndex,
  cursor: number,
  selection: TextSelection | undefined,
  extendSelection: boolean | undefined
): number {
  if (extendSelection !== true && selection !== undefined) return selection.startOffset;
  return index.previous(cursor);
}

function wordRightTarget(
  index: WordBoundaryIndex,
  cursor: number,
  selection: TextSelection | undefined,
  extendSelection: boolean | undefined
): number {
  if (extendSelection !== true && selection !== undefined) return selection.endOffsetExclusive;
  return index.next(cursor);
}

function isWordOperation(operation: TextEditOperation): boolean {
  return operation.kind === 'deleteWordBackward'
    || operation.kind === 'deleteWordForward'
    || operation.kind === 'moveWordLeft'
    || operation.kind === 'moveWordRight';
}

function requiredWordIndex(index: WordBoundaryIndex | undefined): WordBoundaryIndex {
  if (index === undefined) throw new Error('Word editing requires a word boundary index.');
  return index;
}

function sanitizeInsertedText(text: string): string {
  // Keep tabs as source text; their geometry belongs to the active display profile.
  return sanitizeTerminalControlText(text).text.replace(/\n/gu, ' ');
}

function normalizeEditedBuffer(previous: TextEditBuffer, buffer: TextEditBuffer): TextEditBuffer {
  if (previous.text === buffer.text) return buffer;
  const cursor = normalizeTextEditCursor(buffer.text, buffer.cursor);
  return cursor === buffer.cursor ? buffer : { ...buffer, cursor };
}
