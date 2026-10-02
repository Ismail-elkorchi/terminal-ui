import { sourceBoundaries } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { sourceGeometry } from './source-geometry.ts';
import { clampTextOffset } from './text-range.ts';
import type { GraphemeSegment, TerminalTextIndex, TextIndexOptions, TextSelection } from './types.ts';
import { defineTextWidthProfile } from './width-profile.ts';
import { ownedWordBoundaryIndex, lineSelectionAt } from './word-boundaries.ts';

const encoder = new TextEncoder();

export function createTerminalTextIndex(text: string, options: TextIndexOptions = {}): TerminalTextIndex {
  return ownedTerminalTextIndex(sourceBoundaries(text), options);
}

/** Internal adapter for revision-owned component geometry. Explicit grapheme and
 * byte array requests may materialize; prefix/column operations never do. */
export function ownedTerminalTextIndex(source: SourceBoundaryIndex, options: TextIndexOptions = {}): TerminalTextIndex {
  const adopted = { ...options, widthProfile: defineTextWidthProfile(options.widthProfile) };
  const geometry = sourceGeometry(source, adopted);
  let materializedText: string | undefined;
  const text = (): string => materializedText ??= source.source.slice(0);
  let graphemes: readonly GraphemeSegment[] | undefined;
  const measured = (): readonly GraphemeSegment[] => graphemes ??= segmentGraphemesForMeasurement(text(), adopted, undefined, source);
  let retainedByteOffsets: readonly number[] | undefined;
  const byteOffsets = (): readonly number[] => retainedByteOffsets ??= utf8ByteOffsets(measured());
  const wordIndex = () => ownedWordBoundaryIndex(source, adopted);
  return {
    get text() { return text(); },
    get graphemes() { return measured(); },
    get cells() { return geometry.columnAt(source.source.length); },
    codeUnits: source.source.length,
    get bytes() { return byteOffsets().at(-1) ?? 0; },
    graphemeIndexToCodeUnitOffset(index) { return source.offsetAtIndex(index); },
    codeUnitOffsetToGraphemeIndex(offset) { return source.indexAtOffset(offset); },
    graphemeIndexToVisualColumn(index) { return geometry.columnAt(source.offsetAtIndex(index)); },
    visualColumnToGraphemeIndex(column) { return source.indexAtOffset(geometry.offsetAt(column)); },
    graphemeIndexToByteOffset(index) {
      const offsets = byteOffsets();
      return offsets[clampIndex(index, offsets.length - 1)] ?? 0;
    },
    byteOffsetToGraphemeIndex(offset) {
      const offsets = byteOffsets();
      return offsetToGraphemeIndex(offset, offsets, offsets.at(-1) ?? 0);
    },
    previousWordBoundary(offset) { return wordIndex().previous(offset); },
    nextWordBoundary(offset) { return wordIndex().next(offset); },
    wordSelectionAt(offset) { return wordIndex().selectionAt(offset); },
    lineSelectionAt(offset) { return lineSelectionAt(text(), offset); },
    selectedText(selection: TextSelection) {
      const start = clampTextOffset(Math.min(selection.startOffset, selection.endOffsetExclusive), source.source.length);
      const end = clampTextOffset(Math.max(selection.startOffset, selection.endOffsetExclusive), source.source.length);
      return source.source.slice(start, end);
    },
  };
}

function utf8ByteOffsets(graphemes: readonly { readonly text: string }[]): readonly number[] {
  const offsets = [0];
  for (const segment of graphemes) offsets.push((offsets.at(-1) ?? 0) + encoder.encode(segment.text).byteLength);
  return offsets;
}

function offsetToGraphemeIndex(offset: number, offsets: readonly number[], max: number): number {
  const bounded = Number.isFinite(offset) ? Math.max(0, Math.min(max, Math.floor(offset))) : 0;
  let lower = 0;
  let upper = offsets.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((offsets[middle] ?? 0) <= bounded) lower = middle + 1;
    else upper = middle;
  }
  return Math.max(0, Math.min(offsets.length - 1, lower - 1));
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length, Math.floor(index)));
}
