import type {
  ScrollbackHistoryRecord,
  ScrollbackSearchField
} from '../../../ui-model/scrollback-history.ts';

export interface ProjectedScrollbackRecord {
  readonly source: ScrollbackHistoryRecord;
  readonly bodyText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly displayText: string;
  readonly searchFields: readonly ScrollbackSearchField[];
  readonly folded: boolean;
}

const expandedRecords = new WeakMap<ScrollbackHistoryRecord, ProjectedScrollbackRecord>();
const foldedRecords = new WeakMap<ScrollbackHistoryRecord, ProjectedScrollbackRecord>();

export function projectScrollbackRecord(
  record: ScrollbackHistoryRecord,
  folded: boolean
): ProjectedScrollbackRecord {
  const cache = folded ? foldedRecords : expandedRecords;
  const cached = cache.get(record);
  if (cached !== undefined) return cached;
  const bodyText = folded ? foldedBody(record.bodyText) : record.bodyText;
  const metadataEntries = folded
    ? Object.freeze([...record.metadataEntries, Object.freeze(['folded', 'true'] as const)])
    : record.metadataEntries;
  const prefix = [
    ...(record.item.timestamp === undefined ? [] : [`[${record.item.timestamp}]`]),
    ...metadataEntries.map(([key, value]) => `${key}=${value}`)
  ];
  const searchFields = Object.freeze([
    ...(record.item.timestamp === undefined
      ? []
      : [{ kind: 'timestamp' as const, text: record.item.timestamp }]),
    ...metadataEntries.flatMap(([key, value]): readonly ScrollbackSearchField[] => [
      { kind: 'metadataKey', key, text: key },
      { kind: 'metadataValue', key, text: value }
    ]),
    { kind: 'body' as const, text: bodyText }
  ]);
  const projection = Object.freeze({
    source: record,
    bodyText,
    metadataEntries,
    displayText: prefix.length === 0 ? bodyText : `${prefix.join(' ')} ${bodyText}`,
    searchFields,
    folded
  });
  cache.set(record, projection);
  return projection;
}

function foldedBody(text: string): string {
  const newline = text.indexOf('\n');
  return newline < 0 ? text : `${text.slice(0, newline)} ...`;
}
