import { graphemeAt } from './graphemes.ts';
import type { TextEditBuffer, TextSelection } from './types.ts';

export function normalizeTextCursor(text: string, cursor: number): number {
  const bounded = clampTextOffset(cursor, text.length);
  if (bounded === 0 || bounded === text.length) return bounded;
  return graphemeAt(text, bounded)?.startOffset ?? bounded;
}

export function normalizeTextSelection(text: string, selection: TextSelection | undefined): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const start = normalizeTextCursor(text, Math.min(selection.startOffset, selection.endOffsetExclusive));
  const end = normalizeTextCursor(text, Math.max(selection.startOffset, selection.endOffsetExclusive));
  if (start === end) return undefined;
  return { startOffset: start, endOffsetExclusive: end };
}

export function selectedText(text: string, selection: TextSelection): string {
  const start = clampTextOffset(Math.min(selection.startOffset, selection.endOffsetExclusive), text.length);
  const end = clampTextOffset(Math.max(selection.startOffset, selection.endOffsetExclusive), text.length);
  return text.slice(start, end);
}

export function replaceTextRange(text: string, selection: TextSelection, replacement: string): TextEditBuffer {
  const start = normalizeTextCursor(text, Math.min(selection.startOffset, selection.endOffsetExclusive));
  const end = normalizeTextCursor(text, Math.max(selection.startOffset, selection.endOffsetExclusive));
  const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  return { text: next, cursor: normalizeTextEditCursor(next, start + replacement.length) };
}

export function previousGraphemeBoundary(text: string, cursor: number): number {
  const bounded = normalizeTextCursor(text, cursor);
  return graphemeAt(text, bounded - 1)?.startOffset ?? 0;
}

export function nextGraphemeBoundary(text: string, cursor: number): number {
  const bounded = normalizeTextCursor(text, cursor);
  return graphemeAt(text, bounded)?.endOffsetExclusive ?? text.length;
}

export function clampTextOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}

/** After a mutation, a new cluster can join across the edit seam. Place the
 * insertion caret after that complete cluster instead of inside its source. */
export function normalizeTextEditCursor(text: string, cursor: number): number {
  const start = normalizeTextCursor(text, cursor);
  return start === cursor ? cursor : nextGraphemeBoundary(text, start);
}
