import { sanitizeTerminalText } from '../text/index.ts';
import {
  findPreparedTextMatches,
  prepareTextSearchIndex,
  prepareTextSearchQuery
} from '../text/search-index.ts';
import type { PreparedTextSearchIndex, PreparedTextSearchQuery } from '../text/search-index.ts';

export interface ScrollbackItem {
  readonly id: string;
  readonly text: string;
  readonly level?: 'info' | 'warning' | 'error';
  readonly style?: import('../visual/render.ts').TerminalStyle;
  readonly timestamp?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ScrollbackHistoryRecord {
  readonly item: ScrollbackItem;
  readonly itemIndex: number;
  readonly bodyOffset: number;
  readonly bodyText: string;
  readonly displayText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly searchFields: readonly ScrollbackSearchField[];
}

export type ScrollbackSearchField =
  | { readonly kind: 'timestamp'; readonly text: string }
  | { readonly kind: 'metadataKey'; readonly key: string; readonly text: string }
  | { readonly kind: 'metadataValue'; readonly key: string; readonly text: string }
  | { readonly kind: 'body'; readonly text: string };

export interface ScrollbackSearchMatch {
  readonly id: string;
  readonly itemId: string;
  readonly itemIndex: number;
  readonly occurrenceIndex: number;
  readonly field: ScrollbackSearchField['kind'];
  readonly fieldKey?: string;
  readonly start: number;
  readonly end: number;
}

export interface ScrollbackHistorySegment {
  readonly startIndex: number;
  readonly startBodyOffset: number;
  readonly records: readonly ScrollbackHistoryRecord[];
}

export interface ScrollbackHistory {
  readonly kind: 'scrollback-history';
  readonly segments: readonly ScrollbackHistorySegment[];
  readonly itemCount: number;
  readonly bodyLength: number;
}

export function prepareScrollbackHistory(items: readonly ScrollbackItem[]): ScrollbackHistory {
  return appendScrollbackHistory(emptyScrollbackHistory, items);
}

export function appendScrollbackHistory(
  history: ScrollbackHistory,
  items: readonly ScrollbackItem[]
): ScrollbackHistory {
  assertScrollbackHistory(history);
  if (items.length === 0) return history;
  const records = prepareRecords(history, items);
  const segment = scrollbackSegment(records);
  const segments = appendSegment(history.segments, segment);
  const last = records.at(-1);
  return registerHistory(Object.freeze({
    kind: 'scrollback-history',
    segments,
    itemCount: history.itemCount + records.length,
    bodyLength: last === undefined
      ? history.bodyLength
      : last.bodyOffset + last.bodyText.length
  }));
}

export function scrollbackHistoryItemAt(
  history: ScrollbackHistory,
  index: number
): ScrollbackHistoryRecord | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= history.itemCount) return undefined;
  const segment = segmentContainingIndex(history.segments, index);
  return segment?.records[index - segment.startIndex];
}

export function scrollbackHistoryItems(history: ScrollbackHistory): readonly ScrollbackItem[] {
  return history.segments.flatMap((segment) => segment.records.map((record) => record.item));
}

export function scrollbackHistoryRecordMatches(
  record: ScrollbackHistoryRecord,
  query: string
): readonly ScrollbackSearchMatch[] {
  const searchQuery = query.trim();
  if (searchQuery.length === 0) return [];
  return scrollbackHistoryRecordMatchesPrepared(record, prepareScrollbackSearchQuery(searchQuery));
}

export function prepareScrollbackSearchQuery(query: string): PreparedTextSearchQuery {
  return prepareTextSearchQuery(query.trim());
}

export function scrollbackHistoryRecordMatchesPrepared(
  record: ScrollbackHistoryRecord,
  query: PreparedTextSearchQuery
): readonly ScrollbackSearchMatch[] {
  const matches: ScrollbackSearchMatch[] = [];
  for (const field of record.searchFields) {
    const index = searchIndexFor(field);
    for (const match of findPreparedTextMatches(index, query)) {
      const occurrenceIndex = matches.length;
      const fieldKey = 'key' in field ? field.key : undefined;
      const start = index.textIndex.graphemeIndexToCodeUnitOffset(match.startGrapheme);
      const end = index.textIndex.graphemeIndexToCodeUnitOffset(match.endGrapheme);
      matches.push(Object.freeze({
        id: `${record.item.id}:${String(occurrenceIndex)}:${field.kind}:${fieldKey ?? ''}:${String(start)}:${String(end)}`,
        itemId: record.item.id,
        itemIndex: record.itemIndex,
        occurrenceIndex,
        field: field.kind,
        ...(fieldKey === undefined ? {} : { fieldKey }),
        start,
        end
      }));
    }
  }
  return Object.freeze(matches);
}

export function scrollbackHistoryRecordById(
  history: ScrollbackHistory,
  id: string
): ScrollbackHistoryRecord | undefined {
  for (const segment of history.segments) {
    if (segmentIds.get(segment)?.has(id) !== true) continue;
    return segment.records.find((record) => record.item.id === id);
  }
  return undefined;
}

export function isScrollbackHistory(value: unknown): value is ScrollbackHistory {
  return isRecord(value) && histories.has(value);
}

export function assertScrollbackHistory(value: unknown): asserts value is ScrollbackHistory {
  if (!isScrollbackHistory(value)) {
    throw new TypeError('scrollback history must be created with prepareScrollbackHistory().');
  }
}

const histories = new WeakSet<object>();
const segmentIds = new WeakMap<ScrollbackHistorySegment, ReadonlySet<string>>();
const searchIndexes = new WeakMap<ScrollbackSearchField, PreparedTextSearchIndex>();

const emptyScrollbackHistory: ScrollbackHistory = registerHistory(Object.freeze({
  kind: 'scrollback-history',
  segments: Object.freeze([]),
  itemCount: 0,
  bodyLength: 0
}));

function prepareRecords(
  history: ScrollbackHistory,
  items: readonly ScrollbackItem[]
): readonly ScrollbackHistoryRecord[] {
  const appendedIds = new Set<string>();
  let bodyOffset = history.itemCount === 0 ? 0 : history.bodyLength + 1;
  return Object.freeze(items.map((item, offset): ScrollbackHistoryRecord => {
    const id = sanitizeTerminalText(item.id).text;
    if (id.length === 0) throw new TypeError('scrollback item ids must not be empty.');
    if (appendedIds.has(id) || history.segments.some((segment) => segmentIds.get(segment)?.has(id) === true)) {
      throw new TypeError(`Duplicate scrollback item id: ${id}`);
    }
    appendedIds.add(id);
    const bodyText = sanitizeTerminalText(item.text).text;
    const metadataEntries = normalizedMetadataEntries(item.metadata);
    const normalized = normalizeItem(item, id, bodyText, metadataEntries);
    const displayText = displayTextForItem(normalized, bodyText, metadataEntries);
    const record = Object.freeze({
      item: normalized,
      itemIndex: history.itemCount + offset,
      bodyOffset,
      bodyText,
      displayText,
      metadataEntries,
      searchFields: Object.freeze(searchFieldsForItem(normalized, bodyText, metadataEntries))
    });
    bodyOffset += bodyText.length + 1;
    return record;
  }));
}

function searchIndexFor(field: ScrollbackSearchField): PreparedTextSearchIndex {
  const cached = searchIndexes.get(field);
  if (cached !== undefined) return cached;
  const prepared = prepareTextSearchIndex(field.text);
  searchIndexes.set(field, prepared);
  return prepared;
}

function normalizeItem(
  item: ScrollbackItem,
  id: string,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[]
): ScrollbackItem {
  const timestamp = item.timestamp === undefined ? undefined : sanitizeTerminalText(item.timestamp).text;
  return Object.freeze({
    id,
    text: bodyText,
    ...(item.level === undefined ? {} : { level: item.level }),
    ...(item.style === undefined ? {} : { style: item.style }),
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(metadataEntries.length === 0 ? {} : { metadata: Object.freeze(Object.fromEntries(metadataEntries)) })
  });
}

function displayTextForItem(
  item: ScrollbackItem,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[]
): string {
  const prefix = [
    ...(item.timestamp === undefined ? [] : [`[${item.timestamp}]`]),
    ...metadataEntries.map(([key, value]) => `${key}=${value}`)
  ];
  return prefix.length === 0 ? bodyText : `${prefix.join(' ')} ${bodyText}`;
}

function searchFieldsForItem(
  item: ScrollbackItem,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[]
): readonly ScrollbackSearchField[] {
  return [
    ...(item.timestamp === undefined
      ? []
      : [{ kind: 'timestamp' as const, text: item.timestamp }]),
    ...metadataEntries.flatMap(([key, value]): readonly ScrollbackSearchField[] => [
      { kind: 'metadataKey', key, text: key },
      { kind: 'metadataValue', key, text: value }
    ]),
    { kind: 'body', text: bodyText }
  ];
}

function normalizedMetadataEntries(
  metadata: Readonly<Record<string, string>> | undefined
): readonly (readonly [string, string])[] {
  if (metadata === undefined) return [];
  return Object.freeze(Object.entries(metadata)
    .map(([key, value]) => [sanitizeTerminalText(key).text, sanitizeTerminalText(value).text] as const)
    .toSorted(([left], [right]) => compareCodePoints(left, right))
    .map((entry) => Object.freeze(entry)));
}

function scrollbackSegment(records: readonly ScrollbackHistoryRecord[]): ScrollbackHistorySegment {
  const first = records[0];
  const segment = Object.freeze({
    startIndex: first?.itemIndex ?? 0,
    startBodyOffset: first?.bodyOffset ?? 0,
    records
  });
  segmentIds.set(segment, new Set(records.map((record) => record.item.id)));
  return segment;
}

function appendSegment(
  previous: readonly ScrollbackHistorySegment[],
  appended: ScrollbackHistorySegment
): readonly ScrollbackHistorySegment[] {
  const segments = [...previous];
  let carry = appended;
  while ((segments.at(-1)?.records.length ?? Number.POSITIVE_INFINITY) <= carry.records.length) {
    const left = segments.pop();
    if (left === undefined) break;
    carry = scrollbackSegment(Object.freeze([...left.records, ...carry.records]));
  }
  segments.push(carry);
  return Object.freeze(segments);
}

function segmentContainingIndex(
  segments: readonly ScrollbackHistorySegment[],
  index: number
): ScrollbackHistorySegment | undefined {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (segment === undefined) return undefined;
    if (index < segment.startIndex) high = middle - 1;
    else if (index >= segment.startIndex + segment.records.length) low = middle + 1;
    else return segment;
  }
  return undefined;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function registerHistory<T extends ScrollbackHistory>(history: T): T {
  histories.add(history);
  return history;
}
