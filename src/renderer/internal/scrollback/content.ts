import { extractTextSelection, sanitizeTerminalText } from '../../../text/index.ts';
import type { TextSelection } from '../../../text/index.ts';
import type { ScrollbackItem } from '../../../ui-model/documents.ts';

export interface ExtractScrollbackSelectionTextInput {
  readonly items: readonly ScrollbackItem[];
  readonly selectedRange?: TextSelection;
}

export interface ScrollbackBodySelection {
  readonly start: number;
  readonly end: number;
}

export function scrollbackItemsFromUnknown(value: unknown): readonly ScrollbackItem[] {
  return Array.isArray(value) ? value.filter(isScrollbackItem) : [];
}

export function scrollbackDisplayText(item: ScrollbackItem): string {
  const text = sanitizeTerminalText(item.text).text;
  const prefix = [
    ...scrollbackTimestampText(item),
    ...scrollbackMetadataText(item)
  ];
  return prefix.length === 0 ? text : `${prefix.join(' ')} ${text}`;
}

export function scrollbackTimestampText(item: ScrollbackItem): readonly string[] {
  return typeof item.timestamp === 'string'
    ? [`[${sanitizeTerminalText(item.timestamp).text}]`]
    : [];
}

export function scrollbackMetadataEntries(value: unknown): readonly (readonly [string, string])[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([key, rawValue]): (readonly [string, string])[] => {
      if (typeof rawValue !== 'string') return [];
      return [[sanitizeTerminalText(key).text, sanitizeTerminalText(rawValue).text]];
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

export function scrollbackSelectedBodyRanges(
  items: readonly ScrollbackItem[],
  selectedRange: TextSelection | undefined
): readonly (ScrollbackBodySelection | undefined)[] {
  if (selectedRange === undefined) return [];
  const start = Math.min(selectedRange.start, selectedRange.end);
  const end = Math.max(selectedRange.start, selectedRange.end);
  if (start === end) return [];
  const ranges: (ScrollbackBodySelection | undefined)[] = [];
  let offset = 0;
  for (const item of items) {
    const text = sanitizeTerminalText(item.text).text;
    const itemStart = offset;
    const itemEnd = itemStart + text.length;
    const rangeStart = Math.max(start, itemStart);
    const rangeEnd = Math.min(end, itemEnd);
    ranges.push(rangeStart < rangeEnd
      ? { start: rangeStart - itemStart, end: rangeEnd - itemStart }
      : undefined);
    offset = itemEnd + 1;
  }
  return ranges;
}

export function extractScrollbackSelectionText(input: ExtractScrollbackSelectionTextInput): string | undefined {
  if (input.selectedRange === undefined) return undefined;
  const content = input.items.map((item) => sanitizeTerminalText(item.text).text).join('\n');
  return extractTextSelection({ text: content, selection: input.selectedRange, sanitize: false });
}

export function scrollbackItemLevel(item: ScrollbackItem): ScrollbackItem['level'] {
  switch (item.level) {
    case 'info':
    case 'warning':
    case 'error':
      return item.level;
    default:
      return undefined;
  }
}

function scrollbackMetadataText(item: ScrollbackItem): readonly string[] {
  return scrollbackMetadataEntries(item.metadata).map(([key, value]) => `${key}=${value}`);
}

function isScrollbackItem(value: unknown): value is ScrollbackItem {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && 'text' in value
    && typeof value.id === 'string'
    && typeof value.text === 'string';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
