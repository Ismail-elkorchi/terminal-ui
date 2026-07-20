import { sanitizeTerminalText } from './sanitize.ts';
import { normalizeTextCursor } from './selection-model.ts';
import type { TextSelection } from './types.ts';

export interface TextDocument {
  readonly kind: 'text-document';
  readonly text: string;
  readonly lineCount: number;
}

export interface TextDocumentLine {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface TextDocumentIndex {
  readonly lineStarts: readonly number[];
}

const indexes = new WeakMap<TextDocument, TextDocumentIndex>();

export function prepareTextDocument(value: string): TextDocument {
  const text = sanitizeTerminalText(value).text;
  const lineStarts = lineStartsFor(text);
  const document = Object.freeze({
    kind: 'text-document' as const,
    text,
    lineCount: lineStarts.length
  });
  indexes.set(document, Object.freeze({ lineStarts }));
  return document;
}

export function assertTextDocument(value: unknown): asserts value is TextDocument {
  if (!isTextDocument(value)) {
    throw new TypeError('text document must be created with prepareTextDocument().');
  }
}

export function isTextDocument(value: unknown): value is TextDocument {
  return typeof value === 'object' && value !== null && indexes.has(value as TextDocument);
}

export function textDocumentLineAt(
  document: TextDocument,
  index: number
): TextDocumentLine | undefined {
  const data = indexFor(document);
  if (!Number.isInteger(index) || index < 0 || index >= data.lineStarts.length) return undefined;
  const start = data.lineStarts[index];
  if (start === undefined) return undefined;
  const nextStart = data.lineStarts[index + 1];
  const end = nextStart === undefined ? document.text.length : Math.max(start, nextStart - 1);
  return { index, start, end, text: document.text.slice(start, end) };
}

export function textDocumentLineIndexAtOffset(document: TextDocument, offset: number): number {
  const bounded = clampOffset(offset, document.text.length);
  const starts = indexFor(document).lineStarts;
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= bounded) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export function normalizeTextDocumentOffset(document: TextDocument, offset: number): number {
  const bounded = clampOffset(offset, document.text.length);
  const lineIndex = textDocumentLineIndexAtOffset(document, bounded);
  const line = textDocumentLineAt(document, lineIndex);
  if (line === undefined || bounded > line.end) return bounded;
  return line.start + normalizeTextCursor(line.text, bounded - line.start);
}

export function normalizeTextDocumentSelection(
  document: TextDocument,
  selection: TextSelection | undefined
): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const first = normalizeTextDocumentOffset(document, selection.start);
  const second = normalizeTextDocumentOffset(document, selection.end);
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  return start === end ? undefined : { start, end };
}

function lineStartsFor(text: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return Object.freeze(starts);
}

function indexFor(document: TextDocument): TextDocumentIndex {
  const index = indexes.get(document);
  if (index === undefined) throw new TypeError('Invalid text document.');
  return index;
}

function clampOffset(value: number, max: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}
