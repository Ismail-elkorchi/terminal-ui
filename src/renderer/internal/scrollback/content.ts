import { sanitizeTerminalText } from '../../../text/index.ts';
import type { ScrollbackItem } from '../../../ui-model/documents.ts';

export interface ScrollbackBodySelection {
  readonly start: number;
  readonly end: number;
}

export function scrollbackTimestampText(item: ScrollbackItem): readonly string[] {
  return typeof item.timestamp === 'string'
    ? [`[${sanitizeTerminalText(item.timestamp).text}]`]
    : [];
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
