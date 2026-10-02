import { bufferSourceBoundaries, retainBufferBoundaries } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import { sanitizeTerminalControlText, sanitizeTerminalSingleLineText } from './sanitize.ts';
import {
  nextSourceBoundary,
  normalizeSourceCursor,
  normalizeSourceSelection,
  replaceSourceRange,
  previousSourceBoundary,
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
  sourceLineOffsetByDelta,
  lineStartOffset,
  ownedWordBoundaryIndex,
} from './word-boundaries.ts';

export function editTextBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
  options: TextBoundaryOptions = {}
): TextEditBuffer {
  return editOwnedBuffer(buffer, operation, options, (text) => sanitizeTerminalSingleLineText(text).text);
}

/** Source-backed text inputs defer tab expansion until the active display profile is known. */
export function editSourceTextBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
): TextEditBuffer {
  return editOwnedBuffer(buffer, operation, {}, sanitizeInsertedText);
}

function editOwnedBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
  options: TextBoundaryOptions,
  sanitizeInsertion: (text: string) => string,
): TextEditBuffer {
  const source = bufferSourceBoundaries(buffer);
  const result = editBuffer(buffer, operation, options, sanitizeInsertion, source);
  if (result.text === buffer.text) retainBufferBoundaries(result, source);
  return result;
}

function editBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
  options: TextBoundaryOptions,
  sanitizeInsertion: (text: string) => string,
  source: SourceBoundaryIndex,
): TextEditBuffer {
  const words = isWordOperation(operation) ? ownedWordBoundaryIndex(source, options) : undefined;
  const cursor = normalizeSourceCursor(source, buffer.cursor);
  const selection = normalizeSourceSelection(source, buffer.selection);
  switch (operation.kind) {
    case 'insert': {
      return replaceSourceRange(
        source,
        selectedRange(selection, cursor),
        sanitizeInsertion(operation.text)
      );
    }
    case 'replaceRange':
      return replaceSourceRange(
        source,
        operation.range,
        sanitizeInsertion(operation.text)
      );
    case 'deleteBackward':
      if (selection !== undefined) return replaceSourceRange(source, selection, '');
      if (cursor === 0) return { ...buffer, cursor };
      {
        const previous = previousSourceBoundary(source, cursor);
        return replaceSourceRange(source, { startOffset: previous, endOffsetExclusive: cursor }, '');
      }
    case 'deleteForward': {
      if (selection !== undefined) return replaceSourceRange(source, selection, '');
      if (cursor >= buffer.text.length) return { ...buffer, cursor };
      const next = nextSourceBoundary(source, cursor);
      return replaceSourceRange(source, { startOffset: cursor, endOffsetExclusive: next }, '');
    }
    case 'deleteWordBackward':
      if (selection !== undefined) return replaceSourceRange(source, selection, '');
      {
        const startOffset = requiredWordIndex(words).previous(cursor);
        return replaceSourceRange(source, { startOffset, endOffsetExclusive: cursor }, '');
      }
    case 'deleteWordForward':
      if (selection !== undefined) return replaceSourceRange(source, selection, '');
      return replaceSourceRange(source, { startOffset: cursor, endOffsetExclusive: requiredWordIndex(words).next(cursor) }, '');
    case 'moveLeft':
      return moveTo(buffer.text, source, cursor, selection, leftTarget(source, cursor, selection, operation.extendSelection), operation.extendSelection);
    case 'moveRight':
      return moveTo(buffer.text, source, cursor, selection, rightTarget(source, cursor, selection, operation.extendSelection), operation.extendSelection);
    case 'moveWordLeft':
      return moveTo(
        buffer.text, source,
        cursor,
        selection,
        wordLeftTarget(requiredWordIndex(words), cursor, selection, operation.extendSelection),
        operation.extendSelection
      );
    case 'moveWordRight':
      return moveTo(
        buffer.text, source,
        cursor,
        selection,
        wordRightTarget(requiredWordIndex(words), cursor, selection, operation.extendSelection),
        operation.extendSelection
      );
    case 'moveHome':
      return moveTo(buffer.text, source, cursor, selection, lineStartOffset(buffer.text, cursor), operation.extendSelection);
    case 'moveEnd':
      return moveTo(buffer.text, source, cursor, selection, lineEndOffset(buffer.text, cursor), operation.extendSelection);
    case 'moveLineUp':
      return moveTo(buffer.text, source, cursor, selection, sourceLineOffsetByDelta(source, buffer.text, cursor, -1), operation.extendSelection);
    case 'moveLineDown':
      return moveTo(buffer.text, source, cursor, selection, sourceLineOffsetByDelta(source, buffer.text, cursor, 1), operation.extendSelection);
    case 'moveDocumentStart':
      return moveTo(buffer.text, source, cursor, selection, 0, operation.extendSelection);
    case 'moveDocumentEnd':
      return moveTo(buffer.text, source, cursor, selection, buffer.text.length, operation.extendSelection);
    case 'moveTo':
      return moveTo(buffer.text, source, cursor, selection, operation.caret.position.offset, operation.extendSelection);
    case 'selectAll': {
      const normalized = normalizeSourceSelection(source, { startOffset: 0, endOffsetExclusive: buffer.text.length });
      return {
        text: buffer.text,
        cursor: buffer.text.length,
        ...(normalized === undefined ? {} : { selection: normalized })
      };
    }
    case 'replaceSelection':
      return replaceSourceRange(
        source,
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
  source: SourceBoundaryIndex,
  cursor: number,
  selection: TextSelection | undefined,
  target: number,
  extendSelection: boolean | undefined
): TextEditBuffer {
  const nextCursor = normalizeSourceCursor(source, target);
  if (extendSelection !== true) return { text, cursor: nextCursor };
  const anchor = selectionAnchor(selection, cursor);
  const nextSelection = normalizeSourceSelection(source, { startOffset: anchor, endOffsetExclusive: nextCursor });
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
  source: SourceBoundaryIndex,
  cursor: number,
  selection: TextSelection | undefined,
  extendSelection: boolean | undefined
): number {
  if (extendSelection !== true && selection !== undefined) return selection.startOffset;
  return previousSourceBoundary(source, cursor);
}

function rightTarget(
  source: SourceBoundaryIndex,
  cursor: number,
  selection: TextSelection | undefined,
  extendSelection: boolean | undefined
): number {
  if (extendSelection !== true && selection !== undefined) return selection.endOffsetExclusive;
  return nextSourceBoundary(source, cursor);
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
