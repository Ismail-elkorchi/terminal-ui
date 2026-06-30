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

export function previousWordBoundary(text: string, offset: number): number {
  const segments = segmentGraphemes(text);
  const cursor = normalizeTextCursor(text, offset);
  let index = previousSegmentIndex(segments, cursor);
  while (index >= 0 && isWordSeparator(segments[index]?.text ?? '')) index -= 1;
  while (index > 0 && !isWordSeparator(segments[index - 1]?.text ?? '')) index -= 1;
  return segments[index]?.start ?? 0;
}

export function nextWordBoundary(text: string, offset: number): number {
  const segments = segmentGraphemes(text);
  const cursor = normalizeTextCursor(text, offset);
  let index = segmentIndexAtOrAfter(segments, cursor);
  while (index < segments.length && isWordSeparator(segments[index]?.text ?? '')) index += 1;
  while (index < segments.length && !isWordSeparator(segments[index]?.text ?? '')) index += 1;
  return segments[index]?.start ?? text.length;
}

export function lineOffsetByDelta(text: string, offset: number, delta: number): number {
  const cursor = normalizeTextCursor(text, offset);
  const starts = lineStartOffsets(text);
  const current = currentLineIndex(starts, cursor);
  const target = Math.max(0, Math.min(starts.length - 1, current + Math.trunc(delta)));
  const column = visualColumnInRange(text, starts[current] ?? 0, cursor);
  const targetStart = starts[target] ?? 0;
  const targetEnd = lineEndOffset(text, targetStart);
  return offsetAtVisualColumn(text, targetStart, targetEnd, column);
}

function previousSegmentIndex(
  segments: readonly { readonly start: number; readonly end: number }[],
  cursor: number
): number {
  let previous = -1;
  for (const [index, segment] of segments.entries()) {
    if (segment.start >= cursor) break;
    if (segment.end <= cursor) previous = index;
    if (cursor > segment.start && cursor < segment.end) return index;
  }
  return previous;
}

function segmentIndexAtOrAfter(
  segments: readonly { readonly start: number; readonly end: number }[],
  cursor: number
): number {
  for (const [index, segment] of segments.entries()) {
    if (cursor <= segment.start || (cursor > segment.start && cursor < segment.end)) return index;
  }
  return segments.length;
}

function lineStartOffsets(text: string): readonly number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

function currentLineIndex(starts: readonly number[], cursor: number): number {
  let current = 0;
  for (const [index, start] of starts.entries()) {
    if (start > cursor) break;
    current = index;
  }
  return current;
}

function visualColumnInRange(text: string, start: number, offset: number): number {
  const cursor = normalizeTextCursor(text, offset);
  let column = 0;
  for (const segment of segmentGraphemes(text)) {
    if (segment.start < start) continue;
    if (segment.start >= cursor) break;
    column += segment.cells;
  }
  return column;
}

function offsetAtVisualColumn(text: string, start: number, end: number, column: number): number {
  const target = Math.max(0, Math.floor(column));
  let current = 0;
  for (const segment of segmentGraphemes(text)) {
    if (segment.start < start) continue;
    if (segment.start >= end) break;
    const next = current + segment.cells;
    if (next > target) return segment.start;
    if (next === target) return segment.end;
    current = next;
  }
  return end;
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
