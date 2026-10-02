import { editSourceBoundaries, retainBufferBoundaries, sourceBoundaries } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import type { TextEditBuffer, TextSelection } from './types.ts';

export function normalizeTextCursor(text: string, cursor: number): number {
  return normalizeSourceCursor(sourceBoundaries(text), cursor);
}

export function normalizeTextSelection(text: string, selection: TextSelection | undefined): TextSelection | undefined {
  return normalizeSourceSelection(sourceBoundaries(text), selection);
}

export function selectedText(text: string, selection: TextSelection): string {
  const start = clampTextOffset(Math.min(selection.startOffset, selection.endOffsetExclusive), text.length);
  const end = clampTextOffset(Math.max(selection.startOffset, selection.endOffsetExclusive), text.length);
  return text.slice(start, end);
}

export function replaceTextRange(text: string, selection: TextSelection, replacement: string): TextEditBuffer {
  return replaceSourceRange(sourceBoundaries(text), selection, replacement);
}

export function previousGraphemeBoundary(text: string, cursor: number): number {
  return previousSourceBoundary(sourceBoundaries(text), cursor);
}

export function nextGraphemeBoundary(text: string, cursor: number): number {
  return nextSourceBoundary(sourceBoundaries(text), cursor);
}

export function clampTextOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}

export function normalizeSourceCursor(source: SourceBoundaryIndex, cursor: number): number {
  const bounded = clampTextOffset(cursor, source.source.length);
  if (bounded === 0 || bounded === source.source.length) return bounded;
  return source.at(bounded)?.startOffset ?? bounded;
}

export function previousSourceBoundary(source: SourceBoundaryIndex, cursor: number): number {
  return source.at(normalizeSourceCursor(source, cursor) - 1)?.startOffset ?? 0;
}

export function nextSourceBoundary(source: SourceBoundaryIndex, cursor: number): number {
  return source.at(normalizeSourceCursor(source, cursor))?.endOffsetExclusive ?? source.source.length;
}

/** A mutation can join clusters across its seam; place the caret after that complete cluster. */
export function normalizeSourceEditCursor(source: SourceBoundaryIndex, cursor: number): number {
  const start = normalizeSourceCursor(source, cursor);
  return start === cursor ? cursor : nextSourceBoundary(source, start);
}

export function normalizeSourceSelection(source: SourceBoundaryIndex, selection: TextSelection | undefined): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const startOffset = normalizeSourceCursor(source, Math.min(selection.startOffset, selection.endOffsetExclusive));
  const endOffsetExclusive = normalizeSourceCursor(source, Math.max(selection.startOffset, selection.endOffsetExclusive));
  return startOffset === endOffsetExclusive ? undefined : { startOffset, endOffsetExclusive };
}

export function replaceSourceRange(source: SourceBoundaryIndex, selection: TextSelection, replacement: string): TextEditBuffer {
  const start = normalizeSourceCursor(source, Math.min(selection.startOffset, selection.endOffsetExclusive));
  const end = normalizeSourceCursor(source, Math.max(selection.startOffset, selection.endOffsetExclusive));
  const text = `${source.source.slice(0, start)}${replacement}${source.source.slice(end)}`;
  const boundaries = editSourceBoundaries(text, source, start);
  return retainBufferBoundaries({ text, cursor: normalizeSourceEditCursor(boundaries, start + replacement.length) }, boundaries);
}
