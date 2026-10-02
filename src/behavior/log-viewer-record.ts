import type { LogHistoryRecord, LogSearchField } from './log-history.ts';

export interface LogViewerRecordView {
  readonly source: LogHistoryRecord;
  readonly bodyText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly displayText: string;
  readonly searchFields: readonly LogSearchField[];
  readonly fieldOffsets: ReadonlyMap<LogSearchField['kind'], ReadonlyMap<string | undefined, number>>;
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
      metadataEntries: record.metadataEntries, displayText: record.displayText, searchFields: record.searchFields,
      fieldOffsets: fieldOffsets(record.entry.timestamp, record.metadataEntries) });
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
    fieldOffsets: fieldOffsets(record.entry.timestamp, metadataEntries),
  });
  cache.set(record, view);
  return view;
}

function foldedBody(text: string): string {
  const newline = text.indexOf('\n');
  return newline < 0 ? text : `${text.slice(0, newline)} ...`;
}

function fieldOffsets(timestamp: string | undefined, metadata: readonly (readonly [string, string])[]): LogViewerRecordView['fieldOffsets'] {
  const fields = new Map<LogSearchField['kind'], Map<string | undefined, number>>();
  let offset = 0;
  if (timestamp !== undefined) {
    fields.set('timestamp', new Map([[undefined, 1]]));
    offset = timestamp.length + 2;
  }
  const keys = new Map<string | undefined, number>();
  const values = new Map<string | undefined, number>();
  for (const [key, value] of metadata) {
    if (offset > 0) offset++;
    keys.set(key, offset);
    offset += key.length + 1;
    values.set(key, offset);
    offset += value.length;
  }
  fields.set('metadataKey', keys); fields.set('metadataValue', values);
  fields.set('body', new Map([[undefined, offset > 0 ? offset + 1 : 0]]));
  return fields;
}
