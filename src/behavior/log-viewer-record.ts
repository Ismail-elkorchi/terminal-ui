import type { LogHistoryRecord, LogSearchField } from './log-history.ts';

export interface LogViewerRecordView {
  readonly source: LogHistoryRecord;
  readonly bodyText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly displayText: string;
  readonly searchFields: readonly LogSearchField[];
}

const expandedRecords = new WeakMap<LogHistoryRecord, LogViewerRecordView>();
const foldedRecords = new WeakMap<LogHistoryRecord, LogViewerRecordView>();

export function createLogViewerRecordView(
  record: LogHistoryRecord,
  folded: boolean,
): LogViewerRecordView {
  const cache = folded ? foldedRecords : expandedRecords;
  const cached = cache.get(record);
  if (cached !== undefined) return cached;
  if (!folded) {
    const view = Object.freeze({ source: record, bodyText: record.bodyText,
      metadataEntries: record.metadataEntries, displayText: record.displayText, searchFields: record.searchFields });
    cache.set(record, view);
    return view;
  }
  const bodyText = foldedBody(record.bodyText);
  const metadataEntries = Object.freeze([...record.metadataEntries, Object.freeze(['folded', 'true'] as const)]);
  const prefix = [
    ...(record.entry.timestamp === undefined ? [] : [`[${record.entry.timestamp}]`]),
    ...metadataEntries.map(([key, value]) => `${key}=${value}`),
  ];
  const searchFields = Object.freeze([
    ...(record.entry.timestamp === undefined
      ? []
      : [{ kind: 'timestamp' as const, text: record.entry.timestamp }]),
    ...metadataEntries.flatMap(([key, value]): readonly LogSearchField[] => [
      { kind: 'metadataKey', key, text: key },
      { kind: 'metadataValue', key, text: value },
    ]),
    { kind: 'body' as const, text: bodyText },
  ]);
  const view = Object.freeze({
    source: record,
    bodyText,
    metadataEntries,
    displayText: prefix.length === 0 ? bodyText : `${prefix.join(' ')} ${bodyText}`,
    searchFields,
  });
  cache.set(record, view);
  return view;
}

function foldedBody(text: string): string {
  const newline = text.indexOf('\n');
  return newline < 0 ? text : `${text.slice(0, newline)} ...`;
}
