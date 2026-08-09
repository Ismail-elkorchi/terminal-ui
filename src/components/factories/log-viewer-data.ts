import { textWidthProfileKey, wrapTextCells } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import {
  logHistoryRecordMatchesPrepared,
  prepareLogSearchQuery,
} from '../../ui-model/log-history.ts';
import type {
  LogHistory,
  LogHistoryRecord,
  LogHistorySegment,
  LogSearchField,
  LogSearchMatch,
} from '../../ui-model/log-history.ts';

export interface LogViewerRecordModel {
  readonly source: LogHistoryRecord;
  readonly bodyText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly displayText: string;
  readonly searchFields: readonly LogSearchField[];
}

export interface LogViewerLayout {
  readonly segments: readonly LogViewerSegmentLayout[];
  readonly totalRows: number;
}

interface LogViewerSegmentLayout {
  readonly segment: LogHistorySegment;
  readonly startRow: number;
  readonly rowStarts: readonly number[];
  readonly rowCounts: readonly number[];
  readonly totalRows: number;
}

export interface LogViewerVisibleRecord {
  readonly record: LogHistoryRecord;
  readonly localStart: number;
  readonly localEnd: number;
}

export interface LogViewerSearchResults {
  readonly matchingEntries: number;
  readonly matches: readonly LogSearchMatch[];
}

interface CachedSegmentLayout {
  readonly rowStarts: readonly number[];
  readonly rowCounts: readonly number[];
  readonly totalRows: number;
}

interface CachedSegmentSearch {
  readonly matchingEntries: number;
  readonly matches: readonly LogSearchMatch[];
}

const expandedRecords = new WeakMap<LogHistoryRecord, LogViewerRecordModel>();
const foldedRecords = new WeakMap<LogHistoryRecord, LogViewerRecordModel>();
const layoutCache = new WeakMap<LogHistorySegment, Map<string, CachedSegmentLayout>>();
const searchCache = new WeakMap<LogHistorySegment, Map<string, CachedSegmentSearch>>();
const maxLayoutsPerSegment = 8;
const maxSearchesPerSegment = 16;

export function logViewerRecordModel(
  record: LogHistoryRecord,
  folded: boolean,
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
  const model = Object.freeze({
    source: record,
    bodyText,
    metadataEntries,
    displayText: prefix.length === 0 ? bodyText : `${prefix.join(' ')} ${bodyText}`,
    searchFields,
  });
  cache.set(record, model);
  return model;
}

export function logViewerLayout(
  history: LogHistory,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
  foldedIds: ReadonlySet<string>,
): LogViewerLayout {
  const geometryKey = `${wrap ? 'wrap' : 'single'}:${String(Math.max(0, width))}:${
    textWidthProfileKey(widthProfile)
  }`;
  const segments: LogViewerSegmentLayout[] = [];
  let startRow = 0;
  for (const segment of history.segments) {
    const foldKey = segment.records
      .filter((record) => foldedIds.has(record.entry.id))
      .map((record) => record.entry.id)
      .join('\u0000');
    const layout = segmentLayout(
      segment,
      `${geometryKey}:${foldKey}`,
      width,
      wrap,
      widthProfile,
      foldedIds,
    );
    segments.push({ segment, startRow, ...layout });
    startRow += layout.totalRows;
  }
  return Object.freeze({ segments: Object.freeze(segments), totalRows: startRow });
}

export function visibleLogViewerRecords(
  layout: LogViewerLayout,
  start: number,
  end: number,
): readonly LogViewerVisibleRecord[] {
  if (end <= start || layout.segments.length === 0) return [];
  const visible: LogViewerVisibleRecord[] = [];
  let segmentIndex = firstOverlappingSegment(layout.segments, start);
  while (segmentIndex < layout.segments.length) {
    const segment = layout.segments[segmentIndex];
    if (segment === undefined || segment.startRow >= end) break;
    const localStart = Math.max(0, start - segment.startRow);
    const localEnd = Math.min(segment.totalRows, end - segment.startRow);
    let recordIndex = firstOverlappingRecord(segment, localStart);
    while (recordIndex < segment.segment.records.length) {
      const record = segment.segment.records[recordIndex];
      const rowStart = segment.rowStarts[recordIndex] ?? 0;
      const rowCount = segment.rowCounts[recordIndex] ?? 1;
      const rowEnd = rowStart + rowCount;
      if (rowStart >= localEnd) break;
      if (record !== undefined && rowEnd > localStart) {
        visible.push({
          record,
          localStart: Math.max(0, localStart - rowStart),
          localEnd: Math.min(rowCount, localEnd - rowStart),
        });
      }
      recordIndex += 1;
    }
    segmentIndex += 1;
  }
  return Object.freeze(visible);
}

export function logViewerRowForEntry(
  layout: LogViewerLayout,
  entryIndex: number,
): number | undefined {
  let low = 0;
  let high = layout.segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = layout.segments[middle];
    if (segment === undefined) return undefined;
    const start = segment.segment.startIndex;
    const end = start + segment.segment.records.length;
    if (entryIndex < start) high = middle - 1;
    else if (entryIndex >= end) low = middle + 1;
    else {
      const row = segment.rowStarts[entryIndex - start];
      return row === undefined ? undefined : segment.startRow + row;
    }
  }
  return undefined;
}

export function searchLogViewerHistory(
  history: LogHistory,
  query: string,
  foldedIds: ReadonlySet<string>,
): LogViewerSearchResults {
  const searchQuery = query.trim();
  if (searchQuery.length === 0) return { matchingEntries: 0, matches: [] };
  const preparedQuery = prepareLogSearchQuery(searchQuery);
  const matches: LogSearchMatch[] = [];
  let matchingEntries = 0;
  for (const segment of history.segments) {
    const foldKey = segment.records
      .filter((record) => foldedIds.has(record.entry.id))
      .map((record) => record.entry.id)
      .join('\u0000');
    const result = segmentSearch(segment, `${searchQuery}:${foldKey}`, preparedQuery, foldedIds);
    matchingEntries += result.matchingEntries;
    matches.push(...result.matches);
  }
  return Object.freeze({ matchingEntries, matches: Object.freeze(matches) });
}

function segmentLayout(
  segment: LogHistorySegment,
  key: string,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
  foldedIds: ReadonlySet<string>,
): CachedSegmentLayout {
  const cache = cacheFor(layoutCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  const rowStarts: number[] = [];
  const rowCounts: number[] = [];
  let totalRows = 0;
  for (const record of segment.records) {
    rowStarts.push(totalRows);
    const model = logViewerRecordModel(record, foldedIds.has(record.entry.id));
    const count = wrap && width > 0
      ? Math.max(1, wrapTextCells(model.displayText, width, { widthProfile }).length)
      : 1;
    rowCounts.push(count);
    totalRows += count;
  }
  const result = Object.freeze({
    rowStarts: Object.freeze(rowStarts),
    rowCounts: Object.freeze(rowCounts),
    totalRows,
  });
  retain(cache, key, result, maxLayoutsPerSegment);
  return result;
}

function segmentSearch(
  segment: LogHistorySegment,
  key: string,
  query: ReturnType<typeof prepareLogSearchQuery>,
  foldedIds: ReadonlySet<string>,
): CachedSegmentSearch {
  const cache = cacheFor(searchCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  const matches: LogSearchMatch[] = [];
  let matchingEntries = 0;
  for (const record of segment.records) {
    const model = logViewerRecordModel(record, foldedIds.has(record.entry.id));
    const recordMatches = logHistoryRecordMatchesPrepared({
      ...record,
      searchFields: model.searchFields,
    }, query);
    if (recordMatches.length > 0) {
      matchingEntries += 1;
      matches.push(...recordMatches);
    }
  }
  const result = Object.freeze({ matchingEntries, matches: Object.freeze(matches) });
  retain(cache, key, result, maxSearchesPerSegment);
  return result;
}

function firstOverlappingSegment(segments: readonly LogViewerSegmentLayout[], row: number): number {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (segment !== undefined && segment.startRow + segment.totalRows <= row) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstOverlappingRecord(segment: LogViewerSegmentLayout, row: number): number {
  let low = 0;
  let high = segment.rowStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const start = segment.rowStarts[middle] ?? 0;
    const count = segment.rowCounts[middle] ?? 1;
    if (start + count <= row) low = middle + 1;
    else high = middle;
  }
  return low;
}

function cacheFor<TKey extends object, TValue>(
  caches: WeakMap<TKey, Map<string, TValue>>,
  key: TKey,
): Map<string, TValue> {
  const cached = caches.get(key);
  if (cached !== undefined) return cached;
  const created = new Map<string, TValue>();
  caches.set(key, created);
  return created;
}

function touch<TValue>(cache: Map<string, TValue>, key: string): TValue | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function retain<TValue>(
  cache: Map<string, TValue>,
  key: string,
  value: TValue,
  limit: number,
): void {
  cache.delete(key);
  while (cache.size >= limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

function foldedBody(text: string): string {
  const newline = text.indexOf('\n');
  return newline < 0 ? text : `${text.slice(0, newline)} ...`;
}
