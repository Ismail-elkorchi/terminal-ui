import { sanitizeTerminalText } from './sanitize.ts';
import type { TextSelection } from './types.ts';

export interface ExtractTextSelectionInput {
  readonly text: string;
  readonly selection?: TextSelection;
  readonly sanitize?: boolean;
}

export function extractTextSelection(input: ExtractTextSelectionInput): string | undefined {
  if (input.selection === undefined) return undefined;
  const text = input.sanitize === false ? input.text : sanitizeTerminalText(input.text).text;
  const start = clampSelectionOffset(input.selection.start, text.length);
  const end = clampSelectionOffset(input.selection.end, text.length);
  if (start === end) return '';
  return text.slice(Math.min(start, end), Math.max(start, end));
}

function clampSelectionOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}
