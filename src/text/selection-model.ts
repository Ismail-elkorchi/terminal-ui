import { segmentGraphemes } from './graphemes.ts';
import type { TextEditBuffer, TextSelection } from './types.ts';

export function normalizeTextCursor(text: string, cursor: number): number {
  const bounded = clampTextOffset(cursor, text.length);
  if (bounded === 0 || bounded === text.length) return bounded;
  for (const segment of segmentGraphemes(text)) {
    if (bounded === segment.start || bounded === segment.end) return bounded;
    if (bounded > segment.start && bounded < segment.end) return segment.start;
  }
  return bounded;
}

export function normalizeTextSelection(text: string, selection: TextSelection | undefined): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const start = normalizeTextCursor(text, Math.min(selection.start, selection.end));
  const end = normalizeTextCursor(text, Math.max(selection.start, selection.end));
  if (start === end) return undefined;
  return { start, end };
}

export function selectedText(text: string, selection: TextSelection): string {
  const start = clampTextOffset(Math.min(selection.start, selection.end), text.length);
  const end = clampTextOffset(Math.max(selection.start, selection.end), text.length);
  return text.slice(start, end);
}

export function replaceTextRange(text: string, selection: TextSelection, replacement: string): TextEditBuffer {
  const start = normalizeTextCursor(text, Math.min(selection.start, selection.end));
  const end = normalizeTextCursor(text, Math.max(selection.start, selection.end));
  const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  return { text: next, cursor: start + replacement.length };
}

export function previousGraphemeBoundary(text: string, cursor: number): number {
  const bounded = normalizeTextCursor(text, cursor);
  let previous = 0;
  for (const segment of segmentGraphemes(text)) {
    if (segment.end >= bounded) return segment.start;
    previous = segment.start;
  }
  return previous;
}

export function nextGraphemeBoundary(text: string, cursor: number): number {
  const bounded = normalizeTextCursor(text, cursor);
  for (const segment of segmentGraphemes(text)) {
    if (segment.end > bounded) return segment.end;
  }
  return text.length;
}

export function clampTextOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}
