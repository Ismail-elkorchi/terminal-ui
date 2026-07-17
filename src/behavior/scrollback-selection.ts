import { extractTextSelection, sanitizeTerminalText } from '../text/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { ScrollbackItem } from '../ui-model/documents.ts';

export interface ExtractScrollbackSelectionTextInput {
  readonly items: readonly ScrollbackItem[];
  readonly selectedRange?: TextSelection;
}

export function extractScrollbackSelectionText(input: ExtractScrollbackSelectionTextInput): string | undefined {
  if (input.selectedRange === undefined) return undefined;
  const content = input.items.map((item) => sanitizeTerminalText(item.text).text).join('\n');
  return extractTextSelection({ text: content, selection: input.selectedRange, sanitize: false });
}
