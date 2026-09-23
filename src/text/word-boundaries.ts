import { graphemeBoundaryOffsets, segmentGraphemes, segmentWords } from './graphemes.ts';
import { clampTextOffset, normalizeTextCursor } from './text-range.ts';
import type { TextBoundaryOptions, TextSelection } from './types.ts';

export interface WordBoundaryIndex {
  previous(offset: number): number;
  next(offset: number): number;
  selectionAt(offset: number): TextSelection;
}

const wordCacheLimit = 16_777_216;
const wordIndexes = new Map<string, WordBoundaryIndex>();
let wordCacheBytes = 0;

export function createWordBoundaryIndex(
  text: string,
  graphemeOffsets: readonly number[],
  options: TextBoundaryOptions = {}
): WordBoundaryIndex {
  const segments = [...normalizedWordSegments(text, graphemeOffsets, options)];
  const starts = segments.map((segment) => segment.startOffset);
  const ends = segments.map((segment) => segment.endOffsetExclusive);
  return {
    previous(offset) {
      const cursor = normalizeIndexedOffset(offset, graphemeOffsets, text.length);
      const index = lowerBound(starts, cursor) - 1;
      return segments[index]?.startOffset ?? 0;
    },
    next(offset) {
      const cursor = normalizeIndexedOffset(offset, graphemeOffsets, text.length);
      const index = upperBound(ends, cursor);
      return segments[index]?.endOffsetExclusive ?? text.length;
    },
    selectionAt(offset) {
      const cursor = normalizeIndexedOffset(offset, graphemeOffsets, text.length);
      const index = upperBound(starts, cursor) - 1;
      const segment = segments[index];
      const selected = segment !== undefined
        && cursor >= segment.startOffset
        && cursor < segment.endOffsetExclusive
        ? segment
        : segments.at(-1)?.endOffsetExclusive === cursor
          ? segments.at(-1)
          : undefined;
      return selected === undefined
        ? { startOffset: cursor, endOffsetExclusive: cursor }
        : {
            startOffset: selected.startOffset,
            endOffsetExclusive: selected.endOffsetExclusive
          };
    }
  };
}

export function wordSelectionAt(
  text: string,
  offset: number,
  options: TextBoundaryOptions = {}
): TextSelection {
  return standaloneWordBoundaryIndex(text, options).selectionAt(offset);
}

export function lineSelectionAt(text: string, offset: number): TextSelection {
  const cursor = clampTextOffset(offset, text.length);
  return {
    startOffset: lineStartOffset(text, cursor),
    endOffsetExclusive: lineEndOffset(text, cursor)
  };
}

export function lineStartOffset(text: string, offset: number): number {
  const cursor = normalizeLogicalLineOffset(text, offset);
  const starts = lineStartOffsets(text);
  return starts[currentLineIndex(starts, cursor)] ?? 0;
}

export function lineEndOffset(text: string, offset: number): number {
  const cursor = normalizeLogicalLineOffset(text, offset);
  for (let index = cursor; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10 || code === 13) return index;
  }
  return text.length;
}

export function previousWordBoundary(
  text: string,
  offset: number,
  options: TextBoundaryOptions = {}
): number {
  return standaloneWordBoundaryIndex(text, options).previous(offset);
}

export function nextWordBoundary(
  text: string,
  offset: number,
  options: TextBoundaryOptions = {}
): number {
  return standaloneWordBoundaryIndex(text, options).next(offset);
}

export function lineOffsetByDelta(text: string, offset: number, delta: number): number {
  const cursor = normalizeLogicalLineOffset(text, normalizeTextCursor(text, offset));
  const starts = lineStartOffsets(text);
  const current = currentLineIndex(starts, cursor);
  const target = Math.max(0, Math.min(starts.length - 1, current + Math.trunc(delta)));
  const column = visualColumnInRange(text, starts[current] ?? 0, cursor);
  const targetStart = starts[target] ?? 0;
  const targetEnd = lineEndOffset(text, targetStart);
  return offsetAtVisualColumn(text, targetStart, targetEnd, column);
}

export function standaloneWordBoundaryIndex(
  text: string,
  options: TextBoundaryOptions
): WordBoundaryIndex {
  const key = `${options.locale ?? 'en'}\u0000${text}`;
  const cached = wordIndexes.get(key);
  if (cached !== undefined) {
    wordIndexes.delete(key);
    wordIndexes.set(key, cached);
    return cached;
  }
  const index = createWordBoundaryIndex(text, graphemeBoundaryOffsets(text), options);
  const weight = key.length * 2 + text.length * 64;
  if (weight <= wordCacheLimit / 2) {
    wordIndexes.set(key, index);
    wordCacheBytes += weight;
    while (wordCacheBytes > wordCacheLimit) {
      const oldest = wordIndexes.entries().next().value;
      if (oldest === undefined) break;
      wordIndexes.delete(oldest[0]);
      wordCacheBytes -= oldest[0].length * 2 + oldest[0].slice(oldest[0].indexOf('\u0000') + 1).length * 64;
    }
  }
  return index;
}

function* normalizedWordSegments(
  text: string,
  graphemeOffsets: readonly number[],
  options: TextBoundaryOptions
): Iterable<{ readonly startOffset: number; readonly endOffsetExclusive: number }> {
  for (const segment of segmentWords(text, options)) {
    const startOffset = normalizeIndexedOffset(segment.startOffset, graphemeOffsets, text.length);
    const endOffsetExclusive = normalizeIndexedOffset(
      segment.endOffsetExclusive,
      graphemeOffsets,
      text.length
    );
    if (startOffset !== endOffsetExclusive) yield { startOffset, endOffsetExclusive };
  }
}

function normalizeIndexedOffset(
  offset: number,
  graphemeOffsets: readonly number[],
  textLength: number
): number {
  const bounded = clampTextOffset(offset, textLength);
  const index = Math.max(0, upperBound(graphemeOffsets, bounded) - 1);
  return graphemeOffsets[index] ?? 0;
}

function lowerBound(values: readonly number[], target: number): number {
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((values[middle] ?? 0) < target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

function upperBound(values: readonly number[], target: number): number {
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((values[middle] ?? 0) <= target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

function lineStartOffsets(text: string): readonly number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) === 10) index += 1;
      offsets.push(index + 1);
    } else if (code === 10) {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function normalizeLogicalLineOffset(text: string, offset: number): number {
  const cursor = clampTextOffset(offset, text.length);
  return cursor > 0
    && cursor < text.length
    && text.charCodeAt(cursor - 1) === 13
    && text.charCodeAt(cursor) === 10
    ? cursor - 1
    : cursor;
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
