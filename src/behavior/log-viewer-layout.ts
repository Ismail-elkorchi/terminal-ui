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
import { measuredGraphemeEvents } from '../text/graphemes.ts';

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
  readonly recordRows?: readonly Uint32Array[];
}

export interface LogViewerVisibleRecord {
  readonly record: LogHistoryRecord;
  readonly localStart: number;
  readonly localEnd: number;
  readonly sourceRows?: readonly LogViewerSourceRow[];
}

export interface LogViewerSourceRow { readonly start: number; readonly end: number; }

interface CachedSegmentLayout {
  readonly recordRows?: readonly Uint32Array[];
  readonly rowStarts?: readonly number[];
  readonly rowCounts?: readonly number[];
  readonly totalRows: number;
}

const layoutCache = new WeakMap<LogHistorySegment, Map<string, CachedSegmentLayout | WeakRef<CachedSegmentLayout>>>();
const historyLayoutCache = new WeakMap<LogHistory, Map<string, LogViewerLayout | WeakRef<LogViewerLayout>>>();
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
): Generator<number, LogViewerLayout> {
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
    yield segment.records.length;
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
      const offsets = segment.recordRows?.[recordIndex];
      if (record !== undefined && rowEnd > localStart) {
        visible.push({
          record,
          localStart: Math.max(0, localStart - rowStart),
          localEnd: Math.min(rowCount, localEnd - rowStart),
          ...(offsets === undefined ? {} : { sourceRows: sourceRowsInWindow(offsets, Math.max(0, localStart - rowStart), Math.min(rowCount, localEnd - rowStart)) }),
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
): Generator<number, CachedSegmentLayout> {
  const cache = cacheFor(layoutCache, segment);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;
  if (width <= 0) return { totalRows: segment.records.length };
  const rowStarts: number[] = [];
  const rowCounts: number[] = [];
  const recordRows: Uint32Array[] = [];
  let totalRows = 0;
  for (const record of segment.records) {
    rowStarts.push(totalRows);
    const recordView = createLogViewerRecordView(record, foldedIds.has(record.entry.id));
    const boundaries = yield* wrappedSourceRows(recordView.displayText, width, widthProfile);
    recordRows.push(boundaries);
    const count = boundaries.length / 2;
    rowCounts.push(count);
    totalRows += count;
    if (rowCounts.length % 32 === 0) yield 32;
  }
  if (rowCounts.length % 32 > 0) yield rowCounts.length % 32;
  const result = Object.freeze({
    rowStarts: Object.freeze(rowStarts),
    rowCounts: Object.freeze(rowCounts),
    recordRows: Object.freeze(recordRows),
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

function cacheFor<TKey extends object, TValue extends object>(
  caches: WeakMap<TKey, Map<string, TValue | WeakRef<TValue>>>,
  key: TKey,
): Map<string, TValue | WeakRef<TValue>> {
  const cached = caches.get(key);
  if (cached !== undefined) return cached;
  const created = new Map<string, TValue | WeakRef<TValue>>();
  caches.set(key, created);
  return created;
}

function touch<TValue extends object>(cache: Map<string, TValue | WeakRef<TValue>>, key: string): TValue | undefined {
  const retained = cache.get(key);
  const value = retained instanceof WeakRef ? retained.deref() : retained;
  if (value === undefined) return undefined;
  cache.delete(key);
  if (retained !== undefined) cache.set(key, retained);
  return value;
}

function retain<TValue extends { readonly totalRows: number }>(
  cache: Map<string, TValue | WeakRef<TValue>>,
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
  // Large row-boundary tables are owned by accepted views, not multiplied by history cache retention.
  cache.set(key, value.totalRows > 65_536 ? new WeakRef(value) : value);
}

function segmentFoldKey(segment: LogHistorySegment, foldedIds: ReadonlySet<string>): string {
  return JSON.stringify(segment.records.filter(record => foldedIds.has(record.entry.id)).map(record => record.entry.id));
}

function* wrappedSourceRows(text: string, width: number, widthProfile: TextWidthProfile): Generator<number, Uint32Array> {
  const boundaries: number[] = [];
  let start = 0;
  let cells = 0;
  let work = 0;
  for (const part of measuredGraphemeEvents(text, { widthProfile })) {
    if (typeof part === 'number') { yield part; continue; }
    if (part.text === '\n') {
      boundaries.push(start, part.startOffset);
      start = part.endOffsetExclusive;
      cells = 0;
    } else {
      if (cells > 0 && cells + part.cells > width) {
        boundaries.push(start, part.startOffset);
        start = part.startOffset;
        cells = 0;
      }
      cells += part.cells;
    }
    work += part.endOffsetExclusive - part.startOffset;
    if (work >= 2048) { yield work; work = 0; }
  }
  if (work > 0) yield work;
  boundaries.push(start, text.length);
  const result = new Uint32Array(boundaries.length);
  for (let i = 0; i < boundaries.length; i += 1) {
    result[i] = boundaries[i] ?? 0;
    if ((i + 1) % 2048 === 0) yield 2048;
  }
  if (boundaries.length % 2048 > 0) yield boundaries.length % 2048;
  return result;
}

function sourceRowsInWindow(offsets: Uint32Array, start: number, end: number): readonly LogViewerSourceRow[] {
  const rows: LogViewerSourceRow[] = [];
  for (let index = start; index < end; index++) rows.push({ start: offsets[index * 2] ?? 0, end: offsets[index * 2 + 1] ?? 0 });
  return rows;
}

/** Map an owned display-source offset without walking an off-screen record prefix. */
export function logViewerRowForOffset(layout: LogViewerLayout, entryIndex: number, offset: number): number | undefined {
  const entryStart = logViewerRowForEntry(layout, entryIndex);
  if (entryStart === undefined || layout.unwrappedHistory !== undefined) return entryStart;
  let lower = 0;
  let upper = layout.segments.length;
  while (lower < upper) {
    const middle = (lower + upper) >>> 1;
    const segment = layout.segments[middle];
    if (segment === undefined || segment.segment.startIndex + segment.segment.records.length > entryIndex) upper = middle;
    else lower = middle + 1;
  }
  const segment = layout.segments[lower];
  const offsets = segment?.recordRows?.[entryIndex - segment.segment.startIndex];
  if (offsets === undefined) return entryStart;
  lower = 0; upper = offsets.length / 2;
  while (lower < upper) {
    const middle = (lower + upper) >>> 1;
    if ((offsets[middle * 2] ?? 0) <= offset) lower = middle + 1;
    else upper = middle;
  }
  return entryStart + Math.max(0, lower - 1);
}
