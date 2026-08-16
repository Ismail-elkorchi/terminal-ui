import { sanitizeTerminalText } from '../text/index.ts';
import {
  findPreparedTextMatches,
  prepareTextSearchIndex,
  prepareTextSearchQuery
} from '../text/search-index.ts';
import type { PreparedTextSearchIndex, PreparedTextSearchQuery } from '../text/search-index.ts';
import { normalizeTerminalStyle } from '../visual/terminal-style.ts';
import {
  matchPreparedCollectionQuery,
  prepareCollectionQuery,
  prepareQueryCandidate,
} from '../text/query.ts';
import type { CollectionQuery, PreparedCollectionQuery } from '../text/query.ts';

export interface LogEntry {
  readonly id: string;
  readonly text: string;
  readonly level?: 'info' | 'warning' | 'error';
  readonly style?: import('../visual/render.ts').TerminalStyle;
  readonly timestamp?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface LogHistoryRecord {
  readonly entry: LogEntry;
  readonly entryIndex: number;
  readonly bodyOffset: number;
  readonly bodyText: string;
  readonly displayText: string;
  readonly metadataEntries: readonly (readonly [string, string])[];
  readonly searchFields: readonly LogSearchField[];
}

export type LogSearchField =
  | { readonly kind: 'timestamp'; readonly text: string }
  | { readonly kind: 'metadataKey'; readonly key: string; readonly text: string }
  | { readonly kind: 'metadataValue'; readonly key: string; readonly text: string }
  | { readonly kind: 'body'; readonly text: string };

export interface LogSearchMatch {
  readonly id: string;
  readonly entryId: string;
  readonly entryIndex: number;
  readonly occurrenceIndex: number;
  readonly field: LogSearchField['kind'];
  readonly fieldKey?: string;
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
}

export interface PreparedLogSearchQuery {
  readonly kind: 'prepared-log-search-query';
  readonly query: PreparedCollectionQuery;
}

export interface LogHistorySegment {
  readonly startIndex: number;
  readonly startBodyOffset: number;
  readonly records: readonly LogHistoryRecord[];
}

declare const logHistoryBrand: unique symbol;

export interface LogHistory {
  readonly [logHistoryBrand]: true;
  readonly kind: 'log-history';
  readonly entryCount: number;
}

interface LogHistoryData {
  readonly segments: readonly LogHistorySegment[];
  readonly bodyLength: number;
}

export function prepareLogHistory(entries: readonly LogEntry[]): LogHistory {
  return appendLogHistory(emptyLogHistory, entries);
}

export function appendLogHistory(
  history: LogHistory,
  entries: readonly LogEntry[]
): LogHistory {
  const data = historyData(history);
  if (entries.length === 0) return history;
  const records = prepareRecords(history, data, entries);
  const segment = logHistorySegment(records);
  const segments = appendSegment(data.segments, segment);
  const last = records.at(-1);
  const next = Object.freeze({
    kind: 'log-history',
    entryCount: history.entryCount + records.length,
  }) as LogHistory;
  return registerHistory(next, {
    segments,
    bodyLength: last === undefined ? data.bodyLength : last.bodyOffset + last.bodyText.length,
  });
}

export function logHistoryEntryAt(
  history: LogHistory,
  index: number
): LogHistoryRecord | undefined {
  const data = historyData(history);
  if (!Number.isInteger(index) || index < 0 || index >= history.entryCount) return undefined;
  const segment = segmentContainingIndex(data.segments, index);
  return segment?.records[index - segment.startIndex];
}

export function logHistoryEntries(history: LogHistory): readonly LogEntry[] {
  return logHistorySegments(history).flatMap((segment) => segment.records.map((record) => record.entry));
}

export function logHistoryRecordMatches(
  record: LogHistoryRecord,
  query: CollectionQuery,
): readonly LogSearchMatch[] {
  const prepared = prepareLogSearchQuery(query);
  if (prepared.query.text.length === 0) return [];
  return logHistoryRecordMatchesPrepared(record, prepared);
}

export function prepareLogSearchQuery(query: CollectionQuery): PreparedLogSearchQuery {
  const prepared = prepareCollectionQuery(query);
  const result = Object.freeze({ kind: 'prepared-log-search-query' as const, query: prepared });
  preparedLogQueries.set(result, prepareTextSearchQuery(prepared.text, {
    caseSensitive: prepared.caseSensitive,
  }));
  return result;
}

export function logHistoryRecordMatchesPrepared(
  record: LogHistoryRecord,
  query: PreparedLogSearchQuery
): readonly LogSearchMatch[] {
  const textQuery = preparedLogQueries.get(query);
  if (textQuery === undefined) throw new TypeError('log query must be created by prepareLogSearchQuery().');
  const matches: LogSearchMatch[] = [];
  for (const field of record.searchFields) {
    const ranges = query.query.mode === 'contains'
      ? findPreparedTextMatches(searchIndexFor(field, query.query.caseSensitive), textQuery).map((match) => {
          const index = searchIndexFor(field, query.query.caseSensitive);
          return {
            start: index.textIndex.graphemeIndexToCodeUnitOffset(match.startGraphemeIndex),
            end: index.textIndex.graphemeIndexToCodeUnitOffset(match.endGraphemeIndexExclusive),
          };
        })
      : matchPreparedCollectionQuery(
          prepareQueryCandidate({ id: record.entry.id, primary: field.text }),
          query.query,
        )?.ranges.map((range) => ({ start: range.start, end: range.end })) ?? [];
    for (const match of ranges) {
      const occurrenceIndex = matches.length;
      const fieldKey = 'key' in field ? field.key : undefined;
      const startOffset = match.start;
      const endOffsetExclusive = match.end;
      matches.push(Object.freeze({
        id: `${record.entry.id}:${String(occurrenceIndex)}:${field.kind}:${fieldKey ?? ''}:${String(startOffset)}:${String(endOffsetExclusive)}`,
        entryId: record.entry.id,
        entryIndex: record.entryIndex,
        occurrenceIndex,
        field: field.kind,
        ...(fieldKey === undefined ? {} : { fieldKey }),
        startOffset,
        endOffsetExclusive
      }));
    }
  }
  return Object.freeze(matches);
}

export function logHistoryRecordById(
  history: LogHistory,
  id: string
): LogHistoryRecord | undefined {
  for (const segment of logHistorySegments(history)) {
    const record = segmentRecordsById.get(segment)?.get(id);
    if (record !== undefined) return record;
  }
  return undefined;
}

export function isLogHistory(value: unknown): value is LogHistory {
  return histories.has(value as object);
}

export function assertLogHistory(value: unknown): asserts value is LogHistory {
  if (!isLogHistory(value)) {
    throw new TypeError('log history must be created with prepareLogHistory().');
  }
}

const histories = new WeakSet<object>();
const dataByHistory = new WeakMap<LogHistory, LogHistoryData>();
const segmentIds = new WeakMap<LogHistorySegment, ReadonlySet<string>>();
const segmentRecordsById = new WeakMap<LogHistorySegment, ReadonlyMap<string, LogHistoryRecord>>();
const searchIndexes = new WeakMap<LogSearchField, {
  readonly sensitive: PreparedTextSearchIndex;
  readonly insensitive: PreparedTextSearchIndex;
}>();
const preparedLogQueries = new WeakMap<PreparedLogSearchQuery, PreparedTextSearchQuery>();

const emptyLogHistory: LogHistory = registerHistory(Object.freeze({
  kind: 'log-history',
  entryCount: 0,
}) as LogHistory, { segments: Object.freeze([]), bodyLength: 0 });

function prepareRecords(
  history: LogHistory,
  data: LogHistoryData,
  entries: readonly LogEntry[]
): readonly LogHistoryRecord[] {
  const appendedIds = new Set<string>();
  let bodyOffset = history.entryCount === 0 ? 0 : data.bodyLength + 1;
  return Object.freeze(entries.map((entry, offset): LogHistoryRecord => {
    const id = sanitizeTerminalText(entry.id).text;
    if (id.length === 0) throw new TypeError('log entry ids must not be empty.');
    if (appendedIds.has(id) || data.segments.some((segment) => segmentIds.get(segment)?.has(id) === true)) {
      throw new TypeError(`Duplicate log entry id: ${id}`);
    }
    appendedIds.add(id);
    const bodyText = sanitizeTerminalText(entry.text).text;
    const metadataEntries = normalizedMetadataEntries(entry.metadata);
    const normalized = normalizeEntry(entry, id, bodyText, metadataEntries);
    const displayText = displayTextForEntry(normalized, bodyText, metadataEntries);
    const record = Object.freeze({
      entry: normalized,
      entryIndex: history.entryCount + offset,
      bodyOffset,
      bodyText,
      displayText,
      metadataEntries,
      searchFields: Object.freeze(searchFieldsForEntry(normalized, bodyText, metadataEntries))
    });
    bodyOffset += bodyText.length + 1;
    return record;
  }));
}

function searchIndexFor(field: LogSearchField, caseSensitive: boolean): PreparedTextSearchIndex {
  const cached = searchIndexes.get(field);
  if (cached !== undefined) return caseSensitive ? cached.sensitive : cached.insensitive;
  const prepared = Object.freeze({
    sensitive: prepareTextSearchIndex(field.text, { caseSensitive: true }),
    insensitive: prepareTextSearchIndex(field.text),
  });
  searchIndexes.set(field, prepared);
  return caseSensitive ? prepared.sensitive : prepared.insensitive;
}

function normalizeEntry(
  entry: LogEntry,
  id: string,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[]
): LogEntry {
  const timestamp = entry.timestamp === undefined ? undefined : sanitizeTerminalText(entry.timestamp).text;
  return Object.freeze({
    id,
    text: bodyText,
    ...(entry.level === undefined ? {} : { level: entry.level }),
    ...(entry.style === undefined
      ? {}
      : { style: normalizeTerminalStyle(entry.style, 'log entry style') }),
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(metadataEntries.length === 0 ? {} : { metadata: Object.freeze(Object.fromEntries(metadataEntries)) })
  });
}

function displayTextForEntry(
  entry: LogEntry,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[]
): string {
  const prefix = [
    ...(entry.timestamp === undefined ? [] : [`[${entry.timestamp}]`]),
    ...metadataEntries.map(([key, value]) => `${key}=${value}`)
  ];
  return prefix.length === 0 ? bodyText : `${prefix.join(' ')} ${bodyText}`;
}

function searchFieldsForEntry(
  entry: LogEntry,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[]
): readonly LogSearchField[] {
  return [
    ...(entry.timestamp === undefined
      ? []
      : [Object.freeze({ kind: 'timestamp' as const, text: entry.timestamp })]),
    ...metadataEntries.flatMap(([key, value]): readonly LogSearchField[] => [
      Object.freeze({ kind: 'metadataKey', key, text: key }),
      Object.freeze({ kind: 'metadataValue', key, text: value })
    ]),
    Object.freeze({ kind: 'body', text: bodyText })
  ];
}

function normalizedMetadataEntries(
  metadata: Readonly<Record<string, string>> | undefined
): readonly (readonly [string, string])[] {
  if (metadata === undefined) return Object.freeze([]);
  return Object.freeze(Object.entries(metadata)
    .map(([key, value]) => [sanitizeTerminalText(key).text, sanitizeTerminalText(value).text] as const)
    .toSorted(([left], [right]) => compareCodePoints(left, right))
    .map((entry) => Object.freeze(entry)));
}

function logHistorySegment(records: readonly LogHistoryRecord[]): LogHistorySegment {
  const first = records[0];
  const segment = Object.freeze({
    startIndex: first?.entryIndex ?? 0,
    startBodyOffset: first?.bodyOffset ?? 0,
    records
  });
  segmentIds.set(segment, new Set(records.map((record) => record.entry.id)));
  segmentRecordsById.set(segment, new Map(records.map((record) => [record.entry.id, record])));
  return segment;
}

function appendSegment(
  previous: readonly LogHistorySegment[],
  appended: LogHistorySegment
): readonly LogHistorySegment[] {
  const segments = [...previous];
  let carry = appended;
  while ((segments.at(-1)?.records.length ?? Number.POSITIVE_INFINITY) <= carry.records.length) {
    const left = segments.pop();
    if (left === undefined) break;
    carry = logHistorySegment(Object.freeze([...left.records, ...carry.records]));
  }
  segments.push(carry);
  return Object.freeze(segments);
}

function segmentContainingIndex(
  segments: readonly LogHistorySegment[],
  index: number
): LogHistorySegment | undefined {
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

export function logHistorySegments(history: LogHistory): readonly LogHistorySegment[] {
  return historyData(history).segments;
}

function historyData(history: LogHistory): LogHistoryData {
  const data = dataByHistory.get(history);
  if (data === undefined) throw new TypeError('log history must be created with prepareLogHistory().');
  return data;
}

function registerHistory<T extends LogHistory>(history: T, data: LogHistoryData): T {
  histories.add(history);
  dataByHistory.set(history, Object.freeze(data));
  return history;
}
