import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { selectedText } from './selection-model.ts';
import { lineSelectionAt, wordSelectionAt } from './word-boundaries.ts';
import type { TerminalTextIndex, TextMeasurementOptions, TextSelection } from './types.ts';

const encoder = new TextEncoder();

export function createTerminalTextIndex(
  text: string,
  options: TextMeasurementOptions = {}
): TerminalTextIndex {
  const graphemes = segmentGraphemesForMeasurement(text, options);
  const codeUnitOffsets = graphemeCodeUnitOffsets(graphemes, text.length);
  const visualOffsets = visualColumnOffsets(graphemes);
  const byteOffsets = utf8ByteOffsets(graphemes);

  return {
    text,
    graphemes,
    cells: visualOffsets[visualOffsets.length - 1] ?? 0,
    codeUnits: text.length,
    bytes: byteOffsets[byteOffsets.length - 1] ?? 0,
    graphemeIndexToCodeUnitOffset(index) {
      const bounded = clampIndex(index, graphemes.length);
      return graphemes[bounded]?.start ?? text.length;
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
      return byteOffsets[clampIndex(index, graphemes.length)] ?? 0;
    },
    byteOffsetToGraphemeIndex(offset) {
      return offsetToGraphemeIndex(offset, byteOffsets, byteOffsets[byteOffsets.length - 1] ?? 0);
    },
    wordSelectionAt(offset) {
      return wordSelectionAt(text, offset);
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
  graphemes: readonly { readonly start: number }[],
  textLength: number
): readonly number[] {
  return [...graphemes.map((segment) => segment.start), textLength];
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
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const start = offsets[index] ?? 0;
    const end = offsets[index + 1] ?? start;
    if (bounded < end) return index;
  }
  return Math.max(0, offsets.length - 1);
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length, Math.floor(index)));
}
