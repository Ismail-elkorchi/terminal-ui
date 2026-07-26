import {
  nextGraphemeBoundary,
  normalizeTextCursor,
  normalizeTextSelection,
  previousGraphemeBoundary,
  replaceTextRange
} from './selection-model.ts';
import {
  lineEndOffset,
  lineOffsetByDelta,
  lineStartOffset
} from './word-boundaries.ts';
import { createTerminalTextIndex } from './terminal-text-index.ts';
import { sanitizeTerminalText } from './sanitize.ts';
import type {
  TerminalTextIndex,
  TextBoundaryOptions,
  TextEditBuffer,
  TextEditOperation,
  TextSelection
} from './types.ts';

const PAGE_LINE_DELTA = 10;

export function editTextBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation,
  options: TextBoundaryOptions = {}
): TextEditBuffer {
  const words = isWordOperation(operation) ? createTerminalTextIndex(buffer.text, options) : undefined;
  const cursor = words === undefined
    ? normalizeTextCursor(buffer.text, buffer.cursor)
    : normalizeIndexedOffset(words, buffer.cursor);
  const selection = words === undefined
    ? normalizeTextSelection(buffer.text, buffer.selection)
    : normalizeIndexedSelection(words, buffer.selection);
  switch (operation.kind) {
    case 'insert': {
      return replaceTextRange(
        buffer.text,
        selectedRange(selection, cursor),
        sanitizeTerminalText(operation.text).text
      );
    }
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
        const startOffset = requiredWordIndex(words).previousWordBoundary(cursor);
        return {
          text: `${buffer.text.slice(0, startOffset)}${buffer.text.slice(cursor)}`,
          cursor: startOffset
        };
      }
    case 'deleteWordForward':
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      return {
        text: `${buffer.text.slice(0, cursor)}${buffer.text.slice(
          requiredWordIndex(words).nextWordBoundary(cursor)
        )}`,
        cursor
      };
    case 'moveLeft':
      return moveTo(buffer.text, cursor, selection, leftTarget(buffer.text, cursor, selection, operation.select), operation.select);
    case 'moveRight':
      return moveTo(buffer.text, cursor, selection, rightTarget(buffer.text, cursor, selection, operation.select), operation.select);
    case 'moveWordLeft':
      return moveTo(
        buffer.text,
        cursor,
        selection,
        wordLeftTarget(requiredWordIndex(words), cursor, selection, operation.select),
        operation.select,
        words
      );
    case 'moveWordRight':
      return moveTo(
        buffer.text,
        cursor,
        selection,
        wordRightTarget(requiredWordIndex(words), cursor, selection, operation.select),
        operation.select,
        words
      );
    case 'moveHome':
      return moveTo(buffer.text, cursor, selection, lineStartOffset(buffer.text, cursor), operation.select);
    case 'moveEnd':
      return moveTo(buffer.text, cursor, selection, lineEndOffset(buffer.text, cursor), operation.select);
    case 'moveLineUp':
      return moveTo(buffer.text, cursor, selection, lineOffsetByDelta(buffer.text, cursor, -1), operation.select);
    case 'moveLineDown':
      return moveTo(buffer.text, cursor, selection, lineOffsetByDelta(buffer.text, cursor, 1), operation.select);
    case 'movePageUp':
      return moveTo(buffer.text, cursor, selection, lineOffsetByDelta(buffer.text, cursor, -PAGE_LINE_DELTA), operation.select);
    case 'movePageDown':
      return moveTo(buffer.text, cursor, selection, lineOffsetByDelta(buffer.text, cursor, PAGE_LINE_DELTA), operation.select);
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
        sanitizeTerminalText(operation.text).text
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
  select: boolean | undefined,
  index?: TerminalTextIndex
): TextEditBuffer {
  const nextCursor = index === undefined
    ? normalizeTextCursor(text, target)
    : normalizeIndexedOffset(index, target);
  if (select !== true) return { text, cursor: nextCursor };
  const anchor = selectionAnchor(selection, cursor);
  const nextSelection = index === undefined
    ? normalizeTextSelection(text, { startOffset: anchor, endOffsetExclusive: nextCursor })
    : normalizeIndexedSelection(index, { startOffset: anchor, endOffsetExclusive: nextCursor });
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
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.startOffset;
  return previousGraphemeBoundary(text, cursor);
}

function rightTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.endOffsetExclusive;
  return nextGraphemeBoundary(text, cursor);
}

function wordLeftTarget(
  index: TerminalTextIndex,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.startOffset;
  return index.previousWordBoundary(cursor);
}

function wordRightTarget(
  index: TerminalTextIndex,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.endOffsetExclusive;
  return index.nextWordBoundary(cursor);
}

function isWordOperation(operation: TextEditOperation): boolean {
  return operation.kind === 'deleteWordBackward'
    || operation.kind === 'deleteWordForward'
    || operation.kind === 'moveWordLeft'
    || operation.kind === 'moveWordRight';
}

function requiredWordIndex(index: TerminalTextIndex | undefined): TerminalTextIndex {
  if (index === undefined) throw new Error('Word editing requires a prepared terminal text index.');
  return index;
}

function normalizeIndexedOffset(index: TerminalTextIndex, offset: number): number {
  return index.graphemeIndexToCodeUnitOffset(index.codeUnitOffsetToGraphemeIndex(offset));
}

function normalizeIndexedSelection(
  index: TerminalTextIndex,
  selection: TextSelection | undefined
): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const first = normalizeIndexedOffset(index, selection.startOffset);
  const second = normalizeIndexedOffset(index, selection.endOffsetExclusive);
  const startOffset = Math.min(first, second);
  const endOffsetExclusive = Math.max(first, second);
  return startOffset === endOffsetExclusive ? undefined : { startOffset, endOffsetExclusive };
}
