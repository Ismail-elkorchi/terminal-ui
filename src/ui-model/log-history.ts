import { sanitizeTerminalText } from '../text/index.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import {
  findPreparedTextMatches,
  prepareTextSearchIndex,
  prepareTextSearchQuery
} from '../text/search-index.ts';
import type { PreparedTextSearchIndex, PreparedTextSearchQuery } from '../text/search-index.ts';
import { normalizeTerminalStyle } from '../visual/terminal-style.ts';

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

export interface LogHistorySegment {
  readonly startIndex: number;
  readonly startBodyOffset: number;
  readonly records: readonly LogHistoryRecord[];
}

export interface LogHistory {
  readonly kind: 'log-history';
  readonly segments: readonly LogHistorySegment[];
  readonly entryCount: number;
  readonly bodyLength: number;
}

export function prepareLogHistory(entries: readonly LogEntry[]): LogHistory {
  return appendLogHistory(emptyLogHistory, entries);
}

export function appendLogHistory(
  history: LogHistory,
  entries: readonly LogEntry[]
): LogHistory {
  assertLogHistory(history);
  if (entries.length === 0) return history;
  const records = prepareRecords(history, entries);
  const segment = logHistorySegment(records);
  const segments = appendSegment(history.segments, segment);
  const last = records.at(-1);
  return registerHistory(Object.freeze({
    kind: 'log-history',
    segments,
    entryCount: history.entryCount + records.length,
    bodyLength: last === undefined
      ? history.bodyLength
      : last.bodyOffset + last.bodyText.length
  }));
}

export function logHistoryEntryAt(
  history: LogHistory,
  index: number
): LogHistoryRecord | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= history.entryCount) return undefined;
  const segment = segmentContainingIndex(history.segments, index);
  return segment?.records[index - segment.startIndex];
}

export function logHistoryEntries(history: LogHistory): readonly LogEntry[] {
  return history.segments.flatMap((segment) => segment.records.map((record) => record.entry));
}

export function logHistoryRecordMatches(
  record: LogHistoryRecord,
  query: string
): readonly LogSearchMatch[] {
  const searchQuery = query.trim();
  if (searchQuery.length === 0) return [];
  return logHistoryRecordMatchesPrepared(record, prepareLogSearchQuery(searchQuery));
}

export function prepareLogSearchQuery(query: string): PreparedTextSearchQuery {
  return prepareTextSearchQuery(query.trim());
}

export function logHistoryRecordMatchesPrepared(
  record: LogHistoryRecord,
  query: PreparedTextSearchQuery
): readonly LogSearchMatch[] {
  const matches: LogSearchMatch[] = [];
  for (const field of record.searchFields) {
    const index = searchIndexFor(field);
    for (const match of findPreparedTextMatches(index, query)) {
      const occurrenceIndex = matches.length;
      const fieldKey = 'key' in field ? field.key : undefined;
      const startOffset = index.textIndex.graphemeIndexToCodeUnitOffset(match.startGraphemeIndex);
      const endOffsetExclusive = index.textIndex.graphemeIndexToCodeUnitOffset(
        match.endGraphemeIndexExclusive
      );
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
  for (const segment of history.segments) {
    const record = segmentRecordsById.get(segment)?.get(id);
    if (record !== undefined) return record;
  }
  return undefined;
}

export function isLogHistory(value: unknown): value is LogHistory {
  return isNonArrayObject(value) && histories.has(value);
}

export function assertLogHistory(value: unknown): asserts value is LogHistory {
  if (!isLogHistory(value)) {
    throw new TypeError('log history must be created with prepareLogHistory().');
  }
}

const histories = new WeakSet<object>();
const segmentIds = new WeakMap<LogHistorySegment, ReadonlySet<string>>();
const segmentRecordsById = new WeakMap<LogHistorySegment, ReadonlyMap<string, LogHistoryRecord>>();
const searchIndexes = new WeakMap<LogSearchField, PreparedTextSearchIndex>();

const emptyLogHistory: LogHistory = registerHistory(Object.freeze({
  kind: 'log-history',
  segments: Object.freeze([]),
  entryCount: 0,
  bodyLength: 0
}));

function prepareRecords(
  history: LogHistory,
  entries: readonly LogEntry[]
): readonly LogHistoryRecord[] {
  const appendedIds = new Set<string>();
  let bodyOffset = history.entryCount === 0 ? 0 : history.bodyLength + 1;
  return Object.freeze(entries.map((entry, offset): LogHistoryRecord => {
    const id = sanitizeTerminalText(entry.id).text;
    if (id.length === 0) throw new TypeError('log entry ids must not be empty.');
    if (appendedIds.has(id) || history.segments.some((segment) => segmentIds.get(segment)?.has(id) === true)) {
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

function searchIndexFor(field: LogSearchField): PreparedTextSearchIndex {
  const cached = searchIndexes.get(field);
  if (cached !== undefined) return cached;
  const prepared = prepareTextSearchIndex(field.text);
  searchIndexes.set(field, prepared);
  return prepared;
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

function registerHistory<T extends LogHistory>(history: T): T {
  histories.add(history);
  return history;
}
