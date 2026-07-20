import { extractTextSelection } from '../text/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { ScrollbackHistory } from '../ui-model/scrollback-history.ts';

export interface ExtractScrollbackSelectionTextInput {
  readonly history: ScrollbackHistory;
  readonly selectedRange?: TextSelection;
}

export function extractScrollbackSelectionText(
  input: ExtractScrollbackSelectionTextInput
): string | undefined {
  if (input.selectedRange === undefined) return undefined;
  const start = Math.min(input.selectedRange.start, input.selectedRange.end);
  const end = Math.max(input.selectedRange.start, input.selectedRange.end);
  if (start === end) return '';
  const selected: string[] = [];
  for (const segment of input.history.segments) {
    for (const record of segment.records) {
      const recordEnd = record.bodyOffset + record.bodyText.length;
      if (recordEnd < start) continue;
      if (record.bodyOffset > end) return selected.join('\n');
      const localStart = Math.max(0, start - record.bodyOffset);
      const localEnd = Math.min(record.bodyText.length, end - record.bodyOffset);
      if (localEnd >= localStart) {
        selected.push(extractTextSelection({
          text: record.bodyText,
          selection: { start: localStart, end: localEnd },
          sanitize: false
        }) ?? '');
      }
    }
  }
  return selected.join('\n');
}
