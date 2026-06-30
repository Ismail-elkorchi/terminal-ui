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
  lineStartOffset,
  nextWordBoundary,
  previousWordBoundary
} from './word-boundaries.ts';
import type { TextEditBuffer, TextEditOperation, TextSelection } from './types.ts';

const PAGE_LINE_DELTA = 10;

export function editTextBuffer(buffer: TextEditBuffer, operation: TextEditOperation): TextEditBuffer {
  const cursor = normalizeTextCursor(buffer.text, buffer.cursor);
  const selection = normalizeTextSelection(buffer.text, buffer.selection);
  switch (operation.kind) {
    case 'insert': {
      return replaceTextRange(buffer.text, selectedRange(selection, cursor), operation.text);
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
      return replaceTextRange(buffer.text, { start: previousWordBoundary(buffer.text, cursor), end: cursor }, '');
    case 'deleteWordForward':
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      return replaceTextRange(buffer.text, { start: cursor, end: nextWordBoundary(buffer.text, cursor) }, '');
    case 'moveLeft':
      return moveTo(buffer.text, cursor, selection, leftTarget(buffer.text, cursor, selection, operation.select), operation.select);
    case 'moveRight':
      return moveTo(buffer.text, cursor, selection, rightTarget(buffer.text, cursor, selection, operation.select), operation.select);
    case 'moveWordLeft':
      return moveTo(buffer.text, cursor, selection, wordLeftTarget(buffer.text, cursor, selection, operation.select), operation.select);
    case 'moveWordRight':
      return moveTo(buffer.text, cursor, selection, wordRightTarget(buffer.text, cursor, selection, operation.select), operation.select);
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
      const normalized = normalizeTextSelection(buffer.text, { start: 0, end: buffer.text.length });
      return {
        text: buffer.text,
        cursor: buffer.text.length,
        ...(normalized === undefined ? {} : { selection: normalized })
      };
    }
    case 'replaceSelection':
      return replaceTextRange(buffer.text, selectedRange(selection, cursor), operation.text);
  }
}

function selectedRange(selection: TextSelection | undefined, cursor: number): TextSelection {
  return selection ?? { start: cursor, end: cursor };
}

function moveTo(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  target: number,
  select: boolean | undefined
): TextEditBuffer {
  const nextCursor = normalizeTextCursor(text, target);
  if (select !== true) return { text, cursor: nextCursor };
  const anchor = selectionAnchor(selection, cursor);
  const nextSelection = normalizeTextSelection(text, { start: anchor, end: nextCursor });
  return {
    text,
    cursor: nextCursor,
    ...(nextSelection === undefined ? {} : { selection: nextSelection })
  };
}

function selectionAnchor(selection: TextSelection | undefined, cursor: number): number {
  if (selection === undefined) return cursor;
  if (cursor <= selection.start) return selection.end;
  if (cursor >= selection.end) return selection.start;
  return selection.start;
}

function leftTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.start;
  return previousGraphemeBoundary(text, cursor);
}

function rightTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.end;
  return nextGraphemeBoundary(text, cursor);
}

function wordLeftTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.start;
  return previousWordBoundary(text, cursor);
}

function wordRightTarget(
  text: string,
  cursor: number,
  selection: TextSelection | undefined,
  select: boolean | undefined
): number {
  if (select !== true && selection !== undefined) return selection.end;
  return nextWordBoundary(text, cursor);
}
