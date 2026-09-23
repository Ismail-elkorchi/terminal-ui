import type { TextCaret, TextDocumentSelection, TextSelection } from './types.ts';

export function sameTextCaret(left: TextCaret, right: TextCaret): boolean {
  return left.position.offset === right.position.offset
    && left.position.affinity === right.position.affinity
    && left.preferredColumnCells === right.preferredColumnCells;
}

export function sameDocumentSelection(
  left: TextDocumentSelection | undefined,
  right: TextDocumentSelection | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.anchor.offset === right.anchor.offset
    && left.anchor.affinity === right.anchor.affinity
    && left.focus.offset === right.focus.offset
    && left.focus.affinity === right.focus.affinity;
}

export function sameTextSelection(left: TextSelection | undefined, right: TextSelection | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.startOffset === right.startOffset && left.endOffsetExclusive === right.endOffsetExclusive;
}
