import { segmentGraphemes } from './graphemes.ts';
import type { TextEditBuffer, TextEditOperation, TextSelection } from './types.ts';

export function editTextBuffer(buffer: TextEditBuffer, operation: TextEditOperation): TextEditBuffer {
  const cursor = normalizeCursor(buffer.text, buffer.cursor);
  const selection = normalizeSelection(buffer.text, buffer.selection);
  switch (operation.kind) {
    case 'insert': {
      return replaceRange(buffer.text, selectedRange(selection, cursor), operation.text);
    }
    case 'deleteBackward':
      if (selection !== undefined) return replaceRange(buffer.text, selection, '');
      if (cursor === 0) return { ...buffer, cursor };
      {
        const previous = previousGraphemeBoundary(buffer.text, cursor);
        return {
          text: `${buffer.text.slice(0, previous)}${buffer.text.slice(cursor)}`,
          cursor: previous
        };
      }
    case 'deleteForward': {
      if (selection !== undefined) return replaceRange(buffer.text, selection, '');
      if (cursor >= buffer.text.length) return { ...buffer, cursor };
      const next = nextGraphemeBoundary(buffer.text, cursor);
      return {
        text: `${buffer.text.slice(0, cursor)}${buffer.text.slice(next)}`,
        cursor
      };
    }
    case 'moveLeft':
      return { text: buffer.text, cursor: previousGraphemeBoundary(buffer.text, cursor) };
    case 'moveRight':
      return { text: buffer.text, cursor: nextGraphemeBoundary(buffer.text, cursor) };
    case 'moveHome':
      return { text: buffer.text, cursor: 0 };
    case 'moveEnd':
      return { text: buffer.text, cursor: buffer.text.length };
    case 'replaceSelection':
      return replaceRange(buffer.text, selectedRange(selection, cursor), operation.text);
  }
}

function normalizeCursor(text: string, cursor: number): number {
  const bounded = Math.max(0, Math.min(text.length, cursor));
  if (bounded === 0 || bounded === text.length) return bounded;
  for (const segment of segmentGraphemes(text)) {
    if (bounded === segment.start || bounded === segment.end) return bounded;
    if (bounded > segment.start && bounded < segment.end) return segment.start;
  }
  return bounded;
}

function normalizeSelection(text: string, selection: TextSelection | undefined): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const start = normalizeCursor(text, Math.min(selection.start, selection.end));
  const end = normalizeCursor(text, Math.max(selection.start, selection.end));
  if (start === end) return undefined;
  return { start, end };
}

function selectedRange(selection: TextSelection | undefined, cursor: number): TextSelection {
  return selection ?? { start: cursor, end: cursor };
}

function replaceRange(text: string, range: TextSelection, replacement: string): TextEditBuffer {
  const next = `${text.slice(0, range.start)}${replacement}${text.slice(range.end)}`;
  return { text: next, cursor: range.start + replacement.length };
}

function previousGraphemeBoundary(text: string, cursor: number): number {
  let previous = 0;
  for (const segment of segmentGraphemes(text)) {
    if (segment.end >= cursor) return segment.start;
    previous = segment.start;
  }
  return previous;
}

function nextGraphemeBoundary(text: string, cursor: number): number {
  for (const segment of segmentGraphemes(text)) {
    if (segment.end > cursor) return segment.end;
  }
  return text.length;
}
