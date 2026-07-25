import { textWidthProfileKey, wrapTextCells } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
import type {
  LogHistory,
  LogHistoryRecord,
  LogHistorySegment
} from '../../../ui-model/log-history.ts';
import {
  prepareLogSearchQuery,
  logHistoryRecordMatchesPrepared
} from '../../../ui-model/log-history.ts';
import type { LogSearchMatch } from '../../../ui-model/log-history.ts';
import { logViewerRecordModel } from './record-model.ts';

export interface LogViewerLayout {
  readonly segments: readonly LogViewerSegmentLayout[];
  readonly totalRows: number;
}

export interface LogViewerSegmentLayout {
  readonly segment: LogHistorySegment;
  readonly startRow: number;
  readonly rowStarts: readonly number[];
  readonly rowCounts: readonly number[];
  readonly totalRows: number;
}

export interface LogViewerVisibleRecord {
  readonly record: LogHistoryRecord;
  readonly rowStart: number;
  readonly rowCount: number;
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

const MAX_LAYOUTS_PER_SEGMENT = 8;
const MAX_SEARCHES_PER_SEGMENT = 16;
const layoutCache = new WeakMap<LogHistorySegment, Map<string, CachedSegmentLayout>>();
const searchCache = new WeakMap<LogHistorySegment, Map<string, CachedSegmentSearch>>();
const searchWork = new WeakMap<LogHistorySegment, { queryEvaluations: number; recordEvaluations: number }>();

export function logViewerLayout(
  history: LogHistory,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
  foldedIds: ReadonlySet<string> = new Set()
): LogViewerLayout {
  const geometryKey = `${wrap ? 'wrap' : 'single'}:${String(Math.max(0, width))}:${textWidthProfileKey(widthProfile)}`;
  const segments: LogViewerSegmentLayout[] = [];
  let startRow = 0;
  for (const segment of history.segments) {
    const foldKey = segment.records
      .filter((record) => foldedIds.has(record.entry.id))
      .map((record) => record.entry.id)
      .join('\u0000');
    const key = `${geometryKey}:${foldKey}`;
    const layout = segmentLayout(segment, key, width, wrap, widthProfile, foldedIds);
    segments.push({ segment, startRow, ...layout });
    startRow += layout.totalRows;
  }
  return { segments: Object.freeze(segments), totalRows: startRow };
}

export function visibleLogViewerRecords(
  layout: LogViewerLayout,
  start: number,
  end: number
): readonly LogViewerVisibleRecord[] {
  if (end <= start || layout.segments.length === 0) return [];
  const visible: LogViewerVisibleRecord[] = [];
  let segmentIndex = firstOverlappingSegment(layout.segments, start);
  while (segmentIndex < layout.segments.length) {
    const segmentLayout = layout.segments[segmentIndex];
    if (segmentLayout === undefined || segmentLayout.startRow >= end) break;
    const localViewportStart = Math.max(0, start - segmentLayout.startRow);
    const localViewportEnd = Math.min(segmentLayout.totalRows, end - segmentLayout.startRow);
    let recordIndex = firstOverlappingRecord(segmentLayout, localViewportStart);
    while (recordIndex < segmentLayout.segment.records.length) {
      const record = segmentLayout.segment.records[recordIndex];
      const localRowStart = segmentLayout.rowStarts[recordIndex] ?? 0;
      const rowCount = segmentLayout.rowCounts[recordIndex] ?? 1;
      const localRowEnd = localRowStart + rowCount;
      if (localRowStart >= localViewportEnd) break;
      if (record !== undefined && localRowEnd > localViewportStart) {
        visible.push({
          record,
          rowStart: segmentLayout.startRow + localRowStart,
          rowCount,
          localStart: Math.max(0, localViewportStart - localRowStart),
          localEnd: Math.min(rowCount, localViewportEnd - localRowStart)
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
  entryIndex: number
): number | undefined {
  const segmentIndex = segmentContainingEntry(layout.segments, entryIndex);
  const segmentLayout = layout.segments[segmentIndex];
  if (segmentLayout === undefined) return undefined;
  const localIndex = entryIndex - segmentLayout.segment.startIndex;
  const localRow = segmentLayout.rowStarts[localIndex];
  return localRow === undefined ? undefined : segmentLayout.startRow + localRow;
}

export function searchLogViewerHistory(
  history: LogHistory,
  query: string,
  foldedIds: ReadonlySet<string> = new Set()
): LogViewerSearchResults {
  const searchQuery = query.trim();
  if (searchQuery.length === 0) return { matchingEntries: 0, matches: [] };
  const preparedQuery = prepareLogSearchQuery(searchQuery);
  const allMatches: LogSearchMatch[] = [];
  let matchingEntries = 0;
  for (const segment of history.segments) {
    const foldKey = segment.records
      .filter((record) => foldedIds.has(record.entry.id))
      .map((record) => record.entry.id)
      .join('\u0000');
    const results = segmentSearch(segment, `${searchQuery}:${foldKey}`, preparedQuery, foldedIds);
    matchingEntries += results.matchingEntries;
    allMatches.push(...results.matches);
  }
  return {
    matchingEntries,
    matches: Object.freeze(allMatches)
  };
}

function segmentSearch(
  segment: LogHistorySegment,
  key: string,
  query: ReturnType<typeof prepareLogSearchQuery>,
  foldedIds: ReadonlySet<string>
): CachedSegmentSearch {
  const cache = cacheFor(searchCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  const work = searchWork.get(segment) ?? { queryEvaluations: 0, recordEvaluations: 0 };
  work.queryEvaluations += 1;
  work.recordEvaluations += segment.records.length;
  searchWork.set(segment, work);
  const matches: LogSearchMatch[] = [];
  let matchingEntries = 0;
  for (const record of segment.records) {
    const recordModel = logViewerRecordModel(record, foldedIds.has(record.entry.id));
    const recordMatches = logHistoryRecordMatchesPrepared(
      { ...record, searchFields: recordModel.searchFields },
      query
    );
    if (recordMatches.length > 0) {
      matchingEntries += 1;
      matches.push(...recordMatches);
    }
  }
  const result = Object.freeze({ matchingEntries, matches: Object.freeze(matches) });
  retain(cache, key, result, MAX_SEARCHES_PER_SEGMENT);
  return result;
}

export function logViewerSearchStatistics(history: LogHistory): {
  readonly queryEvaluations: number;
  readonly recordEvaluations: number;
} {
  let queryEvaluations = 0;
  let recordEvaluations = 0;
  for (const segment of history.segments) {
    const work = searchWork.get(segment);
    queryEvaluations += work?.queryEvaluations ?? 0;
    recordEvaluations += work?.recordEvaluations ?? 0;
  }
  return Object.freeze({ queryEvaluations, recordEvaluations });
}

function segmentLayout(
  segment: LogHistorySegment,
  key: string,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
  foldedIds: ReadonlySet<string>
): CachedSegmentLayout {
  const cache = cacheFor(layoutCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  const rowStarts: number[] = [];
  const rowCounts: number[] = [];
  let totalRows = 0;
  for (const record of segment.records) {
    rowStarts.push(totalRows);
    const recordModel = logViewerRecordModel(record, foldedIds.has(record.entry.id));
    const rowCount = wrap && width > 0
      ? Math.max(1, wrapTextCells(recordModel.displayText, width, { widthProfile }).length)
      : 1;
    rowCounts.push(rowCount);
    totalRows += rowCount;
  }
  const layout = Object.freeze({
    rowStarts: Object.freeze(rowStarts),
    rowCounts: Object.freeze(rowCounts),
    totalRows
  });
  retain(cache, key, layout, MAX_LAYOUTS_PER_SEGMENT);
  return layout;
}

function firstOverlappingSegment(
  segments: readonly LogViewerSegmentLayout[],
  row: number
): number {
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

function segmentContainingEntry(
  segments: readonly LogViewerSegmentLayout[],
  entryIndex: number
): number {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segmentLayout = segments[middle];
    if (segmentLayout === undefined) return -1;
    const start = segmentLayout.segment.startIndex;
    const end = start + segmentLayout.segment.records.length;
    if (entryIndex < start) high = middle - 1;
    else if (entryIndex >= end) low = middle + 1;
    else return middle;
  }
  return -1;
}

function cacheFor<TKey extends object, TValue>(
  caches: WeakMap<TKey, Map<string, TValue>>,
  key: TKey
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

function retain<TValue>(cache: Map<string, TValue>, key: string, value: TValue, limit: number): void {
  cache.delete(key);
  while (cache.size >= limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
}
