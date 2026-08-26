import { segmentGraphemes } from './graphemes.ts';
import type { TextEditBuffer, TextSelection } from './types.ts';

export function normalizeTextCursor(text: string, cursor: number): number {
  const bounded = clampTextOffset(cursor, text.length);
  if (bounded === 0 || bounded === text.length) return bounded;
  if (isSimpleGraphemeBoundary(text, bounded)) return bounded;
  for (const segment of segmentGraphemes(text)) {
    if (bounded === segment.startOffset || bounded === segment.endOffsetExclusive) return bounded;
    if (bounded > segment.startOffset && bounded < segment.endOffsetExclusive) return segment.startOffset;
  }
  return bounded;
}

function isSimpleGraphemeBoundary(text: string, offset: number): boolean {
  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return previous < 0x80 && next < 0x80 && !(previous === 0x0d && next === 0x0a);
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
  return { text: next, cursor: start + replacement.length };
}

export function previousGraphemeBoundary(text: string, cursor: number): number {
  const bounded = normalizeTextCursor(text, cursor);
  let previous = 0;
  for (const segment of segmentGraphemes(text)) {
    if (segment.endOffsetExclusive >= bounded) return segment.startOffset;
    previous = segment.startOffset;
  }
  return previous;
}

export function nextGraphemeBoundary(text: string, cursor: number): number {
  const bounded = normalizeTextCursor(text, cursor);
  for (const segment of segmentGraphemes(text)) {
    if (segment.endOffsetExclusive > bounded) return segment.endOffsetExclusive;
  }
  return text.length;
}

export function clampTextOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}
