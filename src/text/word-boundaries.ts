import { segmentGraphemes } from './graphemes.ts';
import { clampTextOffset, normalizeTextCursor } from './selection-model.ts';
import type { TextSelection } from './types.ts';

export function wordSelectionAt(text: string, offset: number): TextSelection {
  const segments = segmentGraphemes(text);
  if (segments.length === 0) return { startOffset: 0, endOffsetExclusive: 0 };

  const cursor = normalizeTextCursor(text, offset);
  const index = segmentIndexForWord(text, cursor);
  if (index === undefined) return { startOffset: cursor, endOffsetExclusive: cursor };
  const segment = segments[index];
  if (segment === undefined || isWordSeparator(segment.text)) return { startOffset: cursor, endOffsetExclusive: cursor };

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

  const start = segments[startIndex]?.startOffset ?? cursor;
  const end = segments[endIndex]?.startOffset ?? text.length;
  return { startOffset: start, endOffsetExclusive: end };
}

export function lineSelectionAt(text: string, offset: number): TextSelection {
  const cursor = clampTextOffset(offset, text.length);
  return {
    startOffset: lineStartOffset(text, cursor),
    endOffsetExclusive: lineEndOffset(text, cursor)
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
  return segments[index]?.startOffset ?? 0;
}

export function nextWordBoundary(text: string, offset: number): number {
  const segments = segmentGraphemes(text);
  const cursor = normalizeTextCursor(text, offset);
  let index = segmentIndexAtOrAfter(segments, cursor);
  while (index < segments.length && isWordSeparator(segments[index]?.text ?? '')) index += 1;
  while (index < segments.length && !isWordSeparator(segments[index]?.text ?? '')) index += 1;
  return segments[index]?.startOffset ?? text.length;
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
  segments: readonly { readonly startOffset: number; readonly endOffsetExclusive: number }[],
  cursor: number
): number {
  let previous = -1;
  for (const [index, segment] of segments.entries()) {
    if (segment.startOffset >= cursor) break;
    if (segment.endOffsetExclusive <= cursor) previous = index;
    if (cursor > segment.startOffset && cursor < segment.endOffsetExclusive) return index;
  }
  return previous;
}

function segmentIndexAtOrAfter(
  segments: readonly { readonly startOffset: number; readonly endOffsetExclusive: number }[],
  cursor: number
): number {
  for (const [index, segment] of segments.entries()) {
    if (cursor <= segment.startOffset || (cursor > segment.startOffset && cursor < segment.endOffsetExclusive)) return index;
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
    if (segment.startOffset < start) continue;
    if (segment.startOffset >= cursor) break;
    column += segment.cells;
  }
  return column;
}

function offsetAtVisualColumn(text: string, start: number, end: number, column: number): number {
  const target = Math.max(0, Math.floor(column));
  let current = 0;
  for (const segment of segmentGraphemes(text)) {
    if (segment.startOffset < start) continue;
    if (segment.startOffset >= end) break;
    const next = current + segment.cells;
    if (next > target) return segment.startOffset;
    if (next === target) return segment.endOffsetExclusive;
    current = next;
  }
  return end;
}

function segmentIndexForWord(text: string, cursor: number): number | undefined {
  const segments = segmentGraphemes(text);
  let previousBoundary: number | undefined;
  for (const [index, segment] of segments.entries()) {
    if (cursor > segment.startOffset && cursor < segment.endOffsetExclusive) return index;
    if (cursor === segment.startOffset) {
      if (!isWordSeparator(segment.text)) return index;
      const previous = previousBoundary === undefined ? undefined : segments[previousBoundary];
      if (previous !== undefined && !isWordSeparator(previous.text)) return previousBoundary;
      return index;
    }
    if (cursor === segment.endOffsetExclusive) previousBoundary = index;
  }
  return previousBoundary ?? (text.length === 0 ? undefined : segments.length - 1);
}

function isWordSeparator(text: string): boolean {
  return /^\s+$/u.test(text);
}
