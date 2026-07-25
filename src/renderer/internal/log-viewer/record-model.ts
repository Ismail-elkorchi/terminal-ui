import type {
  LogHistoryRecord,
  LogSearchField
} from '../../../ui-model/log-history.ts';

export interface LogViewerRecordModel {
  readonly source: LogHistoryRecord;
  readonly bodyText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly displayText: string;
  readonly searchFields: readonly LogSearchField[];
  readonly folded: boolean;
}

const expandedRecords = new WeakMap<LogHistoryRecord, LogViewerRecordModel>();
const foldedRecords = new WeakMap<LogHistoryRecord, LogViewerRecordModel>();

export function logViewerRecordModel(
  record: LogHistoryRecord,
  folded: boolean
): LogViewerRecordModel {
  const cache = folded ? foldedRecords : expandedRecords;
  const cached = cache.get(record);
  if (cached !== undefined) return cached;
  const bodyText = folded ? foldedBody(record.bodyText) : record.bodyText;
  const metadataEntries = folded
    ? Object.freeze([...record.metadataEntries, Object.freeze(['folded', 'true'] as const)])
    : record.metadataEntries;
  const prefix = [
    ...(record.entry.timestamp === undefined ? [] : [`[${record.entry.timestamp}]`]),
    ...metadataEntries.map(([key, value]) => `${key}=${value}`)
  ];
  const searchFields = Object.freeze([
    ...(record.entry.timestamp === undefined
      ? []
      : [{ kind: 'timestamp' as const, text: record.entry.timestamp }]),
    ...metadataEntries.flatMap(([key, value]): readonly LogSearchField[] => [
      { kind: 'metadataKey', key, text: key },
      { kind: 'metadataValue', key, text: value }
    ]),
    { kind: 'body' as const, text: bodyText }
  ]);
  const model = Object.freeze({
    source: record,
    bodyText,
    metadataEntries,
    displayText: prefix.length === 0 ? bodyText : `${prefix.join(' ')} ${bodyText}`,
    searchFields,
    folded
  });
  cache.set(record, model);
  return model;
}

function foldedBody(text: string): string {
  const newline = text.indexOf('\n');
  return newline < 0 ? text : `${text.slice(0, newline)} ...`;
}
