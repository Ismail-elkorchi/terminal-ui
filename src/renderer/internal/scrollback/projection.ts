import { textWidthProfileKey, wrapTextCells } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
import type {
  ScrollbackHistory,
  ScrollbackHistoryRecord,
  ScrollbackHistorySegment
} from '../../../ui-model/scrollback-history.ts';
import { scrollbackHistoryRecordMatchCount } from '../../../ui-model/scrollback-history.ts';

export interface ScrollbackLayoutProjection {
  readonly segments: readonly ScrollbackSegmentProjection[];
  readonly totalRows: number;
}

export interface ScrollbackSegmentProjection {
  readonly segment: ScrollbackHistorySegment;
  readonly startRow: number;
  readonly rowStarts: readonly number[];
  readonly rowCounts: readonly number[];
  readonly totalRows: number;
}

export interface ScrollbackVisibleRecord {
  readonly record: ScrollbackHistoryRecord;
  readonly rowStart: number;
  readonly rowCount: number;
  readonly localStart: number;
  readonly localEnd: number;
}

export interface ScrollbackSearchProjection {
  readonly matchingItems: number;
  readonly firstItemIndex?: number;
}

interface CachedSegmentLayout {
  readonly rowStarts: readonly number[];
  readonly rowCounts: readonly number[];
  readonly totalRows: number;
}

const MAX_LAYOUTS_PER_SEGMENT = 8;
const MAX_QUERIES_PER_SEGMENT = 16;
const layoutCache = new WeakMap<ScrollbackHistorySegment, Map<string, CachedSegmentLayout>>();
const queryCache = new WeakMap<ScrollbackHistorySegment, Map<string, readonly number[]>>();

export function projectScrollbackLayout(
  history: ScrollbackHistory,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile
): ScrollbackLayoutProjection {
  const key = `${wrap ? 'wrap' : 'single'}:${String(Math.max(0, width))}:${textWidthProfileKey(widthProfile)}`;
  const segments: ScrollbackSegmentProjection[] = [];
  let startRow = 0;
  for (const segment of history.segments) {
    const layout = segmentLayout(segment, key, width, wrap, widthProfile);
    segments.push({ segment, startRow, ...layout });
    startRow += layout.totalRows;
  }
  return { segments: Object.freeze(segments), totalRows: startRow };
}

export function visibleScrollbackRecords(
  projection: ScrollbackLayoutProjection,
  start: number,
  end: number
): readonly ScrollbackVisibleRecord[] {
  if (end <= start || projection.segments.length === 0) return [];
  const visible: ScrollbackVisibleRecord[] = [];
  let segmentIndex = firstOverlappingSegment(projection.segments, start);
  while (segmentIndex < projection.segments.length) {
    const projected = projection.segments[segmentIndex];
    if (projected === undefined || projected.startRow >= end) break;
    const localViewportStart = Math.max(0, start - projected.startRow);
    const localViewportEnd = Math.min(projected.totalRows, end - projected.startRow);
    let recordIndex = firstOverlappingRecord(projected, localViewportStart);
    while (recordIndex < projected.segment.records.length) {
      const record = projected.segment.records[recordIndex];
      const localRowStart = projected.rowStarts[recordIndex] ?? 0;
      const rowCount = projected.rowCounts[recordIndex] ?? 1;
      const localRowEnd = localRowStart + rowCount;
      if (localRowStart >= localViewportEnd) break;
      if (record !== undefined && localRowEnd > localViewportStart) {
        visible.push({
          record,
          rowStart: projected.startRow + localRowStart,
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

export function scrollbackRowForItem(
  projection: ScrollbackLayoutProjection,
  itemIndex: number
): number | undefined {
  const segmentIndex = segmentContainingItem(projection.segments, itemIndex);
  const projected = projection.segments[segmentIndex];
  if (projected === undefined) return undefined;
  const localIndex = itemIndex - projected.segment.startIndex;
  const localRow = projected.rowStarts[localIndex];
  return localRow === undefined ? undefined : projected.startRow + localRow;
}

export function projectScrollbackSearch(
  history: ScrollbackHistory,
  query: string
): ScrollbackSearchProjection {
  const searchQuery = query.trim();
  if (searchQuery.length === 0) return { matchingItems: 0 };
  let matchingItems = 0;
  let firstItemIndex: number | undefined;
  for (const segment of history.segments) {
    const matches = matchingRecordIndexes(segment, searchQuery);
    matchingItems += matches.length;
    if (firstItemIndex === undefined && matches[0] !== undefined) {
      firstItemIndex = segment.startIndex + matches[0];
    }
  }
  return {
    matchingItems,
    ...(firstItemIndex === undefined ? {} : { firstItemIndex })
  };
}

function segmentLayout(
  segment: ScrollbackHistorySegment,
  key: string,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile
): CachedSegmentLayout {
  const cache = cacheFor(layoutCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  const rowStarts: number[] = [];
  const rowCounts: number[] = [];
  let totalRows = 0;
  for (const record of segment.records) {
    rowStarts.push(totalRows);
    const rowCount = wrap && width > 0
      ? Math.max(1, wrapTextCells(record.displayText, width, { widthProfile }).length)
      : 1;
    rowCounts.push(rowCount);
    totalRows += rowCount;
  }
  const projection = Object.freeze({
    rowStarts: Object.freeze(rowStarts),
    rowCounts: Object.freeze(rowCounts),
    totalRows
  });
  retain(cache, key, projection, MAX_LAYOUTS_PER_SEGMENT);
  return projection;
}

function matchingRecordIndexes(
  segment: ScrollbackHistorySegment,
  query: string
): readonly number[] {
  const cache = cacheFor(queryCache, segment);
  const cached = touch(cache, query);
  if (cached !== undefined) return cached;
  const mutableMatches: number[] = [];
  for (let index = 0; index < segment.records.length; index += 1) {
    const record = segment.records[index];
    if (record !== undefined && scrollbackHistoryRecordMatchCount(record, query) > 0) {
      mutableMatches.push(index);
    }
  }
  const matches = Object.freeze(mutableMatches);
  retain(cache, query, matches, MAX_QUERIES_PER_SEGMENT);
  return matches;
}

function firstOverlappingSegment(
  segments: readonly ScrollbackSegmentProjection[],
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

function firstOverlappingRecord(segment: ScrollbackSegmentProjection, row: number): number {
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

function segmentContainingItem(
  segments: readonly ScrollbackSegmentProjection[],
  itemIndex: number
): number {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const projected = segments[middle];
    if (projected === undefined) return -1;
    const start = projected.segment.startIndex;
    const end = start + projected.segment.records.length;
    if (itemIndex < start) high = middle - 1;
    else if (itemIndex >= end) low = middle + 1;
    else return middle;
  }
  return -1;
}

function cacheFor<TKey extends object, TValue>(
  owner: WeakMap<TKey, Map<string, TValue>>,
  key: TKey
): Map<string, TValue> {
  const cached = owner.get(key);
  if (cached !== undefined) return cached;
  const created = new Map<string, TValue>();
  owner.set(key, created);
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
