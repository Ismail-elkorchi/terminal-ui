import { segmentGraphemes, segmentWords } from './graphemes.ts';
import { clampTextOffset, normalizeTextCursor } from './selection-model.ts';
import type { TextSelection } from './types.ts';

interface WordSegment {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
}

export function wordSelectionAt(text: string, offset: number): TextSelection {
  const cursor = normalizeTextCursor(text, offset);
  const segments = wordSegments(text);
  const segment = segments.find((candidate) =>
    cursor >= candidate.startOffset && cursor < candidate.endOffsetExclusive
  ) ?? (segments.at(-1)?.endOffsetExclusive === cursor ? segments.at(-1) : undefined);
  return segment === undefined
    ? { startOffset: cursor, endOffsetExclusive: cursor }
    : { startOffset: segment.startOffset, endOffsetExclusive: segment.endOffsetExclusive };
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
  const cursor = normalizeTextCursor(text, offset);
  const segments = wordSegments(text);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment !== undefined && segment.startOffset < cursor) return segment.startOffset;
  }
  return 0;
}

export function nextWordBoundary(text: string, offset: number): number {
  const cursor = normalizeTextCursor(text, offset);
  for (const segment of wordSegments(text)) {
    if (segment.endOffsetExclusive > cursor) return segment.endOffsetExclusive;
  }
  return text.length;
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

function wordSegments(text: string): readonly WordSegment[] {
  return segmentWords(text).flatMap((segment) => {
    const startOffset = normalizeTextCursor(text, segment.startOffset);
    const endOffsetExclusive = normalizeTextCursor(text, segment.endOffsetExclusive);
    return startOffset === endOffsetExclusive ? [] : [{ startOffset, endOffsetExclusive }];
  });
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
