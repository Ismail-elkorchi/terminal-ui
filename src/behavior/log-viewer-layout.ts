import { createLogViewerRecordView } from './log-viewer-record.ts';
import type {
  LogHistory,
  LogHistoryRecord,
  LogHistorySegment,
} from './log-history.ts';
import {
  logHistoryEntryAt,
  logHistorySegments,
} from './log-history.ts';
import type { TextWidthProfile } from '../text/types.ts';
import { textWidthProfileKey } from '../text/width-profile.ts';
import { countWrappedTextRows } from '../text/wrap.ts';

export interface LogViewerLayout {
  readonly width: number;
  /** Unwrapped rows use source indices directly, without a whole-history layout. */
  readonly unwrappedHistory?: LogHistory;
  readonly segments: readonly LogViewerSegmentLayout[];
  readonly totalRows: number;
}

interface LogViewerSegmentLayout {
  readonly segment: LogHistorySegment;
  readonly startRow: number;
  readonly rowStarts?: readonly number[];
  readonly rowCounts?: readonly number[];
  readonly totalRows: number;
}

export interface LogViewerVisibleRecord {
  readonly record: LogHistoryRecord;
  readonly localStart: number;
  readonly localEnd: number;
}

interface CachedSegmentLayout {
  readonly rowStarts?: readonly number[];
  readonly rowCounts?: readonly number[];
  readonly totalRows: number;
}

const layoutCache = new WeakMap<LogHistorySegment, Map<string, CachedSegmentLayout>>();
const historyLayoutCache = new WeakMap<LogHistory, Map<string, LogViewerLayout>>();
const maxLayoutsPerSegment = 8;

const unwrappedLayouts = new WeakMap<LogHistory, LogViewerLayout>();
export function unwrappedLogViewerLayout(history: LogHistory): LogViewerLayout {
  const existing = unwrappedLayouts.get(history);
  if (existing !== undefined) return existing;
  const layout = Object.freeze({ width: 0, unwrappedHistory: history, segments: Object.freeze([]), totalRows: history.entryCount });
  unwrappedLayouts.set(history, layout);
  return layout;
}

export function* logViewerLayoutWork(
  history: LogHistory,
  width: number,
  widthProfile: TextWidthProfile,
  foldedIds: ReadonlySet<string>,
  foldedKey: string,
): Generator<void, LogViewerLayout> {
  const geometryKey = `wrap:${String(Math.max(0, width))}:${
    textWidthProfileKey(widthProfile)
  }`;
  const cache = cacheFor(historyLayoutCache, history);
  const key = `${geometryKey}:${foldedKey}`;
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  const segments: LogViewerSegmentLayout[] = [];
  let startRow = 0;
  for (const segment of logHistorySegments(history)) {
    const foldKey = segmentFoldKey(segment, foldedIds);
    const layout = yield* segmentLayoutWork(
      segment,
      `${geometryKey}:${foldKey}`,
      width,
      widthProfile,
      foldedIds,
    );
    segments.push(Object.freeze({ segment, startRow, ...layout }));
    startRow += layout.totalRows;
    // Cache hits still assemble an arbitrarily large history. Keep the same
    // cancellation opportunity after each bounded (at most 256-record) segment.
    yield;
  }
  const result = Object.freeze({ width, segments: Object.freeze(segments), totalRows: startRow });
  retain(cache, key, result, maxLayoutsPerSegment);
  return result;
}

export function visibleLogViewerRecords(
  layout: LogViewerLayout,
  start: number,
  end: number,
): readonly LogViewerVisibleRecord[] {
  if (end <= start) return [];
  const visible: LogViewerVisibleRecord[] = [];
  if (layout.unwrappedHistory !== undefined) {
    for (let index = Math.max(0, Math.floor(start)); index < Math.min(end, layout.totalRows); index++) {
      const record = logHistoryEntryAt(layout.unwrappedHistory, index);
      if (record !== undefined) visible.push({ record, localStart: 0, localEnd: 1 });
    }
    return Object.freeze(visible);
  }
  if (layout.segments.length === 0) return [];
  let segmentIndex = firstOverlappingSegment(layout.segments, start);
  while (segmentIndex < layout.segments.length) {
    const segment = layout.segments[segmentIndex];
    if (segment === undefined || segment.startRow >= end) break;
    const localStart = Math.max(0, start - segment.startRow);
    const localEnd = Math.min(segment.totalRows, end - segment.startRow);
    let recordIndex = firstOverlappingRecord(segment, localStart);
    while (recordIndex < segment.segment.records.length) {
      const record = segment.segment.records[recordIndex];
      const rowStart = segment.rowStarts?.[recordIndex] ?? recordIndex;
      const rowCount = segment.rowCounts?.[recordIndex] ?? 1;
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
  if (layout.unwrappedHistory !== undefined) return entryIndex >= 0 && entryIndex < layout.totalRows ? entryIndex : undefined;
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
      const row = segment.rowStarts?.[entryIndex - start] ?? entryIndex - start;
      return segment.startRow + row;
    }
  }
  return undefined;
}

function* segmentLayoutWork(
  segment: LogHistorySegment,
  key: string,
  width: number,
  widthProfile: TextWidthProfile,
  foldedIds: ReadonlySet<string>,
): Generator<void, CachedSegmentLayout> {
  const cache = cacheFor(layoutCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  if (width <= 0) return { totalRows: segment.records.length };
  const rowStarts: number[] = [];
  const rowCounts: number[] = [];
  let totalRows = 0;
  for (const record of segment.records) {
    rowStarts.push(totalRows);
    const recordView = createLogViewerRecordView(record, foldedIds.has(record.entry.id));
    const count = countWrappedTextRows(recordView.displayText, width, { widthProfile });
    rowCounts.push(count);
    totalRows += count;
    if (rowCounts.length % 32 === 0) yield;
  }
  const result = Object.freeze({
    rowStarts: Object.freeze(rowStarts),
    rowCounts: Object.freeze(rowCounts),
    totalRows,
  });
  retain(cache, key, result, maxLayoutsPerSegment);
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
  if (segment.rowStarts === undefined) return Math.max(0, Math.floor(row));
  let low = 0;
  let high = segment.rowStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const start = segment.rowStarts[middle] ?? 0;
    const count = segment.rowCounts?.[middle] ?? 1;
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

function segmentFoldKey(segment: LogHistorySegment, foldedIds: ReadonlySet<string>): string {
  return JSON.stringify(segment.records.filter(record => foldedIds.has(record.entry.id)).map(record => record.entry.id));
}
