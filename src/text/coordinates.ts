import type {
  TextAffinity,
  TextCaret,
  TextDocumentSelection,
  TextPosition
} from './types.ts';

export function textPositionAt(
  offset: number,
  affinity: TextAffinity = 'downstream'
): TextPosition {
  return { offset: coordinateOffset(offset), affinity };
}

export function textCaretAt(
  offset: number,
  options: {
    readonly affinity?: TextAffinity;
    readonly preferredColumnCells?: number;
  } = {}
): TextCaret {
  const preferredColumnCells = options.preferredColumnCells;
  return {
    position: textPositionAt(offset, options.affinity),
    ...(preferredColumnCells === undefined
      ? {}
      : { preferredColumnCells: coordinateOffset(preferredColumnCells) })
  };
}

export function textDocumentSelectionBetween(
  anchorOffset: number,
  focusOffset: number,
  options: {
    readonly anchorAffinity?: TextAffinity;
    readonly focusAffinity?: TextAffinity;
  } = {}
): TextDocumentSelection {
  return {
    anchor: textPositionAt(anchorOffset, options.anchorAffinity),
    focus: textPositionAt(focusOffset, options.focusAffinity)
  };
}

function coordinateOffset(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Text coordinate offsets must be finite non-negative numbers.');
  }
  return Math.floor(value);
}
