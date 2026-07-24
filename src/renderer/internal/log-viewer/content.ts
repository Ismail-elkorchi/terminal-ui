import { sanitizeTerminalText } from '../../../text/index.ts';
import type { LogEntry } from '../../../ui-model/documents.ts';

export interface LogViewerBodySelection {
  readonly start: number;
  readonly end: number;
}

export function logEntryTimestampText(entry: LogEntry): readonly string[] {
  return typeof entry.timestamp === 'string'
    ? [`[${sanitizeTerminalText(entry.timestamp).text}]`]
    : [];
}

export function logEntryLevel(entry: LogEntry): LogEntry['level'] {
  switch (entry.level) {
    case 'info':
    case 'warning':
    case 'error':
      return entry.level;
    default:
      return undefined;
  }
}
