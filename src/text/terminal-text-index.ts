import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { selectedText } from './selection-model.ts';
import { lineSelectionAt, prepareWordBoundaryIndex } from './word-boundaries.ts';
import type { TerminalTextIndex, TextIndexOptions, TextSelection } from './types.ts';

const encoder = new TextEncoder();

export function createTerminalTextIndex(
  text: string,
  options: TextIndexOptions = {}
): TerminalTextIndex {
  const graphemes = segmentGraphemesForMeasurement(text, options);
  const codeUnitOffsets = graphemeCodeUnitOffsets(graphemes, text.length);
  const visualOffsets = visualColumnOffsets(graphemes);
  let retainedByteOffsets: readonly number[] | undefined;
  const byteOffsets = (): readonly number[] => {
    retainedByteOffsets ??= utf8ByteOffsets(graphemes);
    return retainedByteOffsets;
  };
  let words: ReturnType<typeof prepareWordBoundaryIndex> | undefined;
  const wordIndex = (): ReturnType<typeof prepareWordBoundaryIndex> => {
    words ??= prepareWordBoundaryIndex(text, codeUnitOffsets, options);
    return words;
  };

  return {
    text,
    graphemes,
    cells: visualOffsets[visualOffsets.length - 1] ?? 0,
    codeUnits: text.length,
    get bytes() {
      const offsets = byteOffsets();
      return offsets[offsets.length - 1] ?? 0;
    },
    graphemeIndexToCodeUnitOffset(index) {
      const bounded = clampIndex(index, graphemes.length);
      return graphemes[bounded]?.startOffset ?? text.length;
    },
    codeUnitOffsetToGraphemeIndex(offset) {
      return offsetToGraphemeIndex(offset, codeUnitOffsets, text.length);
    },
    graphemeIndexToVisualColumn(index) {
      return visualOffsets[clampIndex(index, graphemes.length)] ?? 0;
    },
    visualColumnToGraphemeIndex(column) {
      return offsetToGraphemeIndex(column, visualOffsets, visualOffsets[visualOffsets.length - 1] ?? 0);
    },
    graphemeIndexToByteOffset(index) {
      return byteOffsets()[clampIndex(index, graphemes.length)] ?? 0;
    },
    byteOffsetToGraphemeIndex(offset) {
      const offsets = byteOffsets();
      return offsetToGraphemeIndex(offset, offsets, offsets[offsets.length - 1] ?? 0);
    },
    previousWordBoundary(offset) {
      return wordIndex().previous(offset);
    },
    nextWordBoundary(offset) {
      return wordIndex().next(offset);
    },
    wordSelectionAt(offset) {
      return wordIndex().selectionAt(offset);
    },
    lineSelectionAt(offset) {
      return lineSelectionAt(text, offset);
    },
    selectedText(selection: TextSelection) {
      return selectedText(text, selection);
    }
  };
}

function visualColumnOffsets(graphemes: readonly { readonly cells: number }[]): readonly number[] {
  const offsets = [0];
  for (const segment of graphemes) {
    offsets.push((offsets[offsets.length - 1] ?? 0) + segment.cells);
  }
  return offsets;
}

function graphemeCodeUnitOffsets(
  graphemes: readonly { readonly startOffset: number }[],
  textLength: number
): readonly number[] {
  return [...graphemes.map((segment) => segment.startOffset), textLength];
}

function utf8ByteOffsets(graphemes: readonly { readonly text: string }[]): readonly number[] {
  const offsets = [0];
  for (const segment of graphemes) {
    offsets.push((offsets[offsets.length - 1] ?? 0) + encoder.encode(segment.text).byteLength);
  }
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
