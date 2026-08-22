import { sanitizeTerminalText } from './sanitize.ts';
import { normalizeTextSelection, selectedText } from './selection-model.ts';
import {
  normalizeTextDocumentSelectionModel,
  textDocumentSlice,
} from './document.ts';
import type { TextDocument } from './document.ts';
import type {
  TextDocumentSelection,
  TextEditBuffer,
  TextSelection,
} from './types.ts';

export interface ExtractTextSelectionInput {
  readonly text: string;
  readonly selection?: TextSelection;
  readonly sanitize?: boolean;
}

export function extractTextSelection(input: ExtractTextSelectionInput): string | undefined {
  const selection = normalizeTextSelection(input.text, input.selection);
  if (selection === undefined) return undefined;
  const extracted = selectedText(input.text, selection);
  return input.sanitize === false ? extracted : sanitizeTerminalText(extracted).text;
}

export interface ExtractTextBufferSelectionInput {
  readonly buffer: TextEditBuffer;
  readonly sanitize?: boolean;
}

export function extractTextBufferSelection(
  input: ExtractTextBufferSelectionInput,
): string | undefined {
  return extractTextSelection({
    text: input.buffer.text,
    ...(input.buffer.selection === undefined ? {} : { selection: input.buffer.selection }),
    ...(input.sanitize === undefined ? {} : { sanitize: input.sanitize }),
  });
}

export interface ExtractTextDocumentSelectionInput {
  readonly document: TextDocument;
  readonly selection?: TextDocumentSelection;
  readonly sanitize?: boolean;
}

export function extractTextDocumentSelection(
  input: ExtractTextDocumentSelectionInput,
): string | undefined {
  const selection = normalizeTextDocumentSelectionModel(input.document, input.selection);
  if (selection === undefined) return undefined;
  const start = Math.min(selection.anchor.offset, selection.focus.offset);
  const end = Math.max(selection.anchor.offset, selection.focus.offset);
  const extracted = textDocumentSlice(input.document, start, end);
  return input.sanitize === false ? extracted : sanitizeTerminalText(extracted).text;
}
