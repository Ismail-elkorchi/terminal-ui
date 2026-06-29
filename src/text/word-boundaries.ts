import { segmentGraphemes } from './graphemes.ts';
import { clampTextOffset, normalizeTextCursor } from './selection-model.ts';
import type { TextSelection } from './types.ts';

export function wordSelectionAt(text: string, offset: number): TextSelection {
  const segments = segmentGraphemes(text);
  if (segments.length === 0) return { start: 0, end: 0 };

  const cursor = normalizeTextCursor(text, offset);
  const index = segmentIndexForWord(text, cursor);
  if (index === undefined) return { start: cursor, end: cursor };
  const segment = segments[index];
  if (segment === undefined || isWordSeparator(segment.text)) return { start: cursor, end: cursor };

  let startIndex = index;
  while (startIndex > 0) {
    const previous = segments[startIndex - 1];
    if (previous === undefined || isWordSeparator(previous.text)) break;
    startIndex -= 1;
  }

  let endIndex = index + 1;
  while (endIndex < segments.length) {
    const next = segments[endIndex];
    if (next === undefined || isWordSeparator(next.text)) break;
    endIndex += 1;
  }

  const start = segments[startIndex]?.start ?? cursor;
  const end = segments[endIndex]?.start ?? text.length;
  return { start, end };
}

export function lineSelectionAt(text: string, offset: number): TextSelection {
  const cursor = clampTextOffset(offset, text.length);
  return {
    start: lineStartOffset(text, cursor),
    end: lineEndOffset(text, cursor)
  };
}

export function lineStartOffset(text: string, offset: number): number {
  const cursor = clampTextOffset(offset, text.length);
  return text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
}

export function lineEndOffset(text: string, offset: number): number {
  const cursor = clampTextOffset(offset, text.length);
  const next = text.indexOf('\n', cursor);
  return next === -1 ? text.length : next;
}

function segmentIndexForWord(text: string, cursor: number): number | undefined {
  const segments = segmentGraphemes(text);
  let previousBoundary: number | undefined;
  for (const [index, segment] of segments.entries()) {
    if (cursor > segment.start && cursor < segment.end) return index;
    if (cursor === segment.start) {
      if (!isWordSeparator(segment.text)) return index;
      const previous = previousBoundary === undefined ? undefined : segments[previousBoundary];
      if (previous !== undefined && !isWordSeparator(previous.text)) return previousBoundary;
      return index;
    }
    if (cursor === segment.end) previousBoundary = index;
  }
  return previousBoundary ?? (text.length === 0 ? undefined : segments.length - 1);
}

function isWordSeparator(text: string): boolean {
  return /^\s+$/u.test(text);
}
