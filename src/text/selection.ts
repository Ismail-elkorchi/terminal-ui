import { sanitizeTerminalText } from './sanitize.ts';
import { selectedText } from './selection-model.ts';
import type { TextSelection } from './types.ts';

export interface ExtractTextSelectionInput {
  readonly text: string;
  readonly selection?: TextSelection;
  readonly sanitize?: boolean;
}

export function extractTextSelection(input: ExtractTextSelectionInput): string | undefined {
  if (input.selection === undefined) return undefined;
  const text = input.sanitize === false ? input.text : sanitizeTerminalText(input.text).text;
  return selectedText(text, input.selection);
}
