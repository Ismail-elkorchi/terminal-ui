import { snapshotArray } from '../foundation/array-snapshot.ts';
import { orderedItemByIdWork, createOrderedSource, createOrderedSourceWork, appendOrderedItemsWork, type OrderedSource } from '../foundation/ordered-source.ts';
import { finishWork, prepareWork, stableSortWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import type {
  CollectionQuery,
  CompiledCollectionQuery,
  IndexedQueryCandidate,
} from '../text/query.ts';
import {
  compileCollectionQuery,
  collectionQuerySearch,
  indexQueryCandidateWork,
  matchCompiledCollectionQueryWork,
  queryFieldSearchIndexWork,
} from '../text/query.ts';
import { sanitizeTerminalTextWork } from '../text/sanitize.ts';
import type { CompiledTextSearchQuery, TextSearchIndex } from '../text/search-index.ts';
import {
  textMatchEvents,
  textSearchOffset,
} from '../text/search-index.ts';
import { decodeTerminalStyle } from '../visual/terminal-style.ts';

export type LogLevel = 'info' | 'warning' | 'error';

export interface LogEntry {
  readonly id: string;
  readonly text: string;
  readonly level?: LogLevel;
  readonly style?: import('../visual/render-content.ts').TerminalStyle;
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

export interface CompiledLogSearchQuery {
  readonly kind: 'compiled-log-search-query';
  readonly query: CompiledCollectionQuery;
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
  readonly segments: OrderedSource<LogHistorySegment>;
  readonly records: OrderedSource<LogHistoryRecord>;
  readonly bodyLength: number;
}

export function createLogHistory(entries: readonly LogEntry[]): LogHistory {
  return appendLogHistory(emptyLogHistory, entries);
}

export function appendLogHistory(
  history: LogHistory,
  entries: readonly LogEntry[]
): LogHistory {
  return finishWork(appendLogHistoryWork(history, eagerLogBatches(entries), false));
}

/** Batches own at most 256 descriptors and 1024 metadata fields before yielding.
 * Immutable strings and application payloads are consumed without deep cloning. */
export function prepareLogHistory(batches: Iterable<readonly LogEntry[]>, context: CooperativeWorkContext): Promise<LogHistory> {
  return prepareAppendLogHistory(emptyLogHistory, batches, context);
}
export function prepareAppendLogHistory(history: LogHistory, batches: Iterable<readonly LogEntry[]>, context: CooperativeWorkContext): Promise<LogHistory> {
  return prepareWork(appendLogHistoryWork(history, batches), context);
}
function* eagerLogBatches(entries: readonly LogEntry[]): IterableIterator<readonly LogEntry[]> {
  if (!Array.isArray(entries)) throw new TypeError('Log entries must be an array.');
  const owned = snapshotArray(entries);
  for (let start = 0; start < owned.length; start += 256) yield owned.slice(start, start + 256);
}
function ownLogBatch(batch: readonly LogEntry[], bounded: boolean): readonly LogEntry[] {
  if (!Array.isArray(batch)) throw new TypeError('Log batches must be arrays of at most 256 entries.');
  const length = batch.length;
  if (length > 256) throw new TypeError('Log batches must be arrays of at most 256 entries.');
  let fields = 0;
  return snapshotArray<LogEntry>(batch, length).map(entry => {
    const candidate: unknown = entry;
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(entry)) throw new TypeError('Log entry must be an object.');
    const { id, text, timestamp, level, metadata, style } = entry;
    if (typeof id !== 'string' || typeof text !== 'string' || timestamp !== undefined && typeof timestamp !== 'string') throw new TypeError('Log text fields must be strings.');
    if (level !== undefined && !['info', 'warning', 'error'].includes(level)) throw new TypeError('Log level is invalid.');
    const ownedMetadata: Record<string, string> = Object.create(null) as Record<string, string>;
    if (metadata !== undefined) {
      const metadataValue: unknown = metadata;
      if (metadataValue === null || typeof metadataValue !== 'object' || Array.isArray(metadata)) throw new TypeError('Log metadata must be an object.');
      for (const key in metadata) {
        if (!Object.hasOwn(metadata, key)) continue;
        if (++fields > 1024 && bounded) throw new TypeError('Log batches must contain at most 1024 metadata fields.');
        const value = metadata[key];
        if (typeof value !== 'string') throw new TypeError('Log metadata values must be strings.');
        ownedMetadata[key] = value;
      }
    }
    return Object.freeze({ id, text,
      ...(timestamp === undefined ? {} : { timestamp }), ...(level === undefined ? {} : { level }),
      ...(metadata === undefined ? {} : { metadata: Object.freeze(ownedMetadata) }),
      ...(style === undefined ? {} : { style: decodeTerminalStyle(style, 'log entry style') }),
    });
  });
}
function* appendLogHistoryWork(history: LogHistory, batches: Iterable<readonly LogEntry[]>, bounded = true): Generator<number, LogHistory> {
  if (history.entryCount === 0) return yield* createLogHistoryWork(history, batches, bounded);
  let data = historyData(history);
  let current = history;
  for (const supplied of batches) {
    const entries = ownLogBatch(supplied, bounded);
    if (entries.length === 0) { yield 1; continue; }
    const records = yield* createLogRecordsWork(current.entryCount, data, entries);
    let global = data.records;
    for (const record of records) {
      global = yield* appendOrderedItemsWork(global, [{ id: record.entry.id, value: record }]);
      yield 1;
    }
    const segment = logHistorySegment(records);
    const segments = yield* appendOrderedItemsWork(data.segments, [{ id: String(segment.startIndex), value: segment }]);
    const last = records.at(-1);
    data = { segments, records: global, bodyLength: last === undefined ? data.bodyLength : last.bodyOffset + last.bodyText.length };
    current = Object.freeze({ kind: 'log-history', entryCount: global.count }) as LogHistory;
    yield 1;
  }
  return current === history ? history : registerHistory(current, data);
}

function* createLogHistoryWork(history: LogHistory, batches: Iterable<readonly LogEntry[]>, bounded = true): Generator<number, LogHistory> {
  let data = historyData(history);
  let count = 0;
  function* events() {
    for (const supplied of batches) {
      const entries = ownLogBatch(supplied, bounded);
      if (entries.length === 0) { yield 1; continue; }
      const records = yield* createLogRecordsWork(count, data, entries);
      const segment = logHistorySegment(records);
      const segments = yield* appendOrderedItemsWork(data.segments, [{ id: String(segment.startIndex), value: segment }]);
      const last = records.at(-1);
      data = { ...data, segments, bodyLength: last === undefined ? data.bodyLength : last.bodyOffset + last.bodyText.length };
      count += records.length;
      yield 1;
      for (const record of records) yield { id: record.entry.id, value: record };
    }
  }
  const records = yield* createOrderedSourceWork(events());
  return records.count === 0 ? history : registerHistory(Object.freeze({ kind: 'log-history', entryCount: records.count }) as LogHistory, { ...data, records });
}

export function logHistoryEntryAt(
  history: LogHistory,
  index: number
): LogHistoryRecord | undefined {
  const data = historyData(history);
  if (!Number.isInteger(index) || index < 0 || index >= history.entryCount) return undefined;
  return data.records.itemAt(index);
}

export function logHistoryEntries(history: LogHistory): readonly LogEntry[] {
  return Object.freeze(Array.from(historyData(history).records.values(), record => record.entry));
}

export function logHistoryRecordMatches(
  record: LogHistoryRecord,
  query: CollectionQuery,
): readonly LogSearchMatch[] {
  const compiled = compileLogSearchQuery(query);
  if (compiled.query.text.length === 0) return [];
  return logHistoryRecordMatchesCompiled(record, compiled);
}

export function compileLogSearchQuery(query: CollectionQuery): CompiledLogSearchQuery {
  const compiled = compileCollectionQuery(query);
  const result = Object.freeze({ kind: 'compiled-log-search-query' as const, query: compiled });
  compiledLogQueries.set(result, collectionQuerySearch(compiled));
  return result;
}

export function logHistoryRecordMatchesCompiled(
  record: LogHistoryRecord,
  query: CompiledLogSearchQuery,
  fields: readonly LogSearchField[] = record.searchFields,
): readonly LogSearchMatch[] {
  return finishWork(logHistoryRecordMatchesWork(record, query, fields));
}

export function* logHistoryRecordMatchesWork(
  record: LogHistoryRecord, query: CompiledLogSearchQuery,
  fields: readonly LogSearchField[] = record.searchFields,
): Generator<number, readonly LogSearchMatch[]> {
  const textQuery = compiledLogQueries.get(query);
  if (textQuery === undefined) throw new TypeError('log query must be created by compileLogSearchQuery().');
  const matches: LogSearchMatch[] = [];
  for (const field of fields) {
    if (query.query.mode === 'contains') {
      const index = yield* searchIndexForWork(field, query.query.caseSensitive);
      for (const start of textMatchEvents(index, textQuery)) {
        if (start < 0) { yield -start; continue; }
        appendMatch(matches, record, field, textSearchOffset(index, start),
          textSearchOffset(index, start + textQuery.graphemes.length));
      }
    } else {
      const result = yield* matchCompiledCollectionQueryWork(yield* candidateForWork(field), query.query);
      for (const match of result?.ranges ?? []) appendMatch(matches, record, field, match.start, match.end);
    }
  }
  return matches.length === 0 ? emptyMatches : Object.freeze(matches);
}

const emptyMatches: readonly LogSearchMatch[] = Object.freeze([]);

function appendMatch(matches: LogSearchMatch[], record: LogHistoryRecord, field: LogSearchField,
  startOffset: number, endOffsetExclusive: number): void {
  const occurrenceIndex = matches.length;
  const fieldKey = 'key' in field ? field.key : undefined;
  matches.push(Object.freeze({
    id: `${record.entry.id}:${String(occurrenceIndex)}:${field.kind}:${fieldKey ?? ''}:${String(startOffset)}:${String(endOffsetExclusive)}`,
    entryId: record.entry.id, entryIndex: record.entryIndex, occurrenceIndex, field: field.kind,
    ...(fieldKey === undefined ? {} : { fieldKey }), startOffset, endOffsetExclusive,
  }));
}

export function logHistoryRecordById(
  history: LogHistory,
  id: string
): LogHistoryRecord | undefined {
  return historyData(history).records.itemById(id);
}

export function isLogHistory(value: unknown): value is LogHistory {
  return histories.has(value as object);
}

export function assertLogHistory(value: unknown): asserts value is LogHistory {
  if (!isLogHistory(value)) {
    throw new TypeError('log history must be created with createLogHistory().');
  }
}

const histories = new WeakSet<object>();
const dataByHistory = new WeakMap<LogHistory, LogHistoryData>();
const compiledLogQueries = new WeakMap<CompiledLogSearchQuery, CompiledTextSearchQuery>();

const emptyLogHistory: LogHistory = registerHistory(Object.freeze({
  kind: 'log-history',
  entryCount: 0,
}) as LogHistory, { segments: createOrderedSource<LogHistorySegment>(), records: createOrderedSource<LogHistoryRecord>(), bodyLength: 0 });

function* createLogRecordsWork(
  entryStart: number,
  data: LogHistoryData,
  entries: readonly LogEntry[]
): Generator<number, readonly LogHistoryRecord[]> {
  const appendedIds = new Set<string>();
  let bodyOffset = entryStart === 0 ? 0 : data.bodyLength + 1;
  const records: LogHistoryRecord[] = [];
  for (const [offset, entry] of entries.entries()) {
    const id = (yield* sanitizeTerminalTextWork(entry.id)).text;
    if (id.length === 0) throw new TypeError('log entry ids must not be empty.');
    if (appendedIds.has(id)) throw new TypeError(`Duplicate log entry id: ${id}`);
    if ((yield* orderedItemByIdWork(data.records, id)) !== undefined) throw new TypeError(`Duplicate log entry id: ${id}`);
    appendedIds.add(id);
    const bodyText = (yield* sanitizeTerminalTextWork(entry.text)).text;
    const metadataEntries = yield* normalizedMetadataEntriesWork(entry.metadata);
    const timestamp = entry.timestamp === undefined ? undefined : (yield* sanitizeTerminalTextWork(entry.timestamp)).text;
    const normalized = normalizeEntry(entry, id, bodyText, metadataEntries, timestamp);
    const displayText = displayTextForEntry(normalized, bodyText, metadataEntries);
    const record = Object.freeze({
      entry: normalized,
      entryIndex: entryStart + offset,
      bodyOffset,
      bodyText,
      displayText,
      metadataEntries,
      searchFields: Object.freeze(searchFieldsForEntry(normalized, bodyText, metadataEntries))
    });
    for (const field of record.searchFields) {
      yield* candidateForWork(field);
      yield 1;
    }
    bodyOffset += bodyText.length + 1;
    records.push(record);
    if (records.length % 256 === 0) yield 256;
  }
  return Object.freeze(records);
}

const queryCandidates = new WeakMap<LogSearchField, IndexedQueryCandidate>();

function* candidateForWork(field: LogSearchField): Generator<number, IndexedQueryCandidate> {
  let candidate = queryCandidates.get(field);
  if (candidate === undefined) {
    candidate = yield* indexQueryCandidateWork({ id: '', primary: field.text });
    queryCandidates.set(field, candidate);
  }
  return candidate;
}

function* searchIndexForWork(field: LogSearchField, caseSensitive: boolean): Generator<number, TextSearchIndex> {
  return yield* queryFieldSearchIndexWork(yield* candidateForWork(field), 0, caseSensitive);
}

function normalizeEntry(
  entry: LogEntry,
  id: string,
  bodyText: string,
  metadataEntries: readonly (readonly [string, string])[],
  timestamp: string | undefined,
): LogEntry {
  return Object.freeze({
    id,
    text: bodyText,
    ...(entry.level === undefined ? {} : { level: entry.level }),
    ...(entry.style === undefined
      ? {}
      : { style: decodeTerminalStyle(entry.style, 'log entry style') }),
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

function* normalizedMetadataEntriesWork(
  metadata: Readonly<Record<string, string>> | undefined,
): Generator<number, readonly (readonly [string, string])[]> {
  if (metadata === undefined) return Object.freeze([]);
  const entries: (readonly [string, string])[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    entries.push(Object.freeze([(yield* sanitizeTerminalTextWork(key)).text,
      (yield* sanitizeTerminalTextWork(value)).text] as const));
    if (entries.length % 256 === 0) yield 256;
  }
  return Object.freeze(yield* stableSortWork(entries, ([left], [right]) => compareCodePoints(left, right)));
}

function logHistorySegment(records: readonly LogHistoryRecord[]): LogHistorySegment {
  const first = records[0];
  const segment = Object.freeze({
    startIndex: first?.entryIndex ?? 0,
    startBodyOffset: first?.bodyOffset ?? 0,
    records
  });
  return segment;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function logHistorySegments(history: LogHistory): IterableIterator<LogHistorySegment> {
  return historyData(history).segments.values();
}

function historyData(history: LogHistory): LogHistoryData {
  const data = dataByHistory.get(history);
  if (data === undefined) throw new TypeError('log history must be created with createLogHistory().');
  return data;
}

function registerHistory<T extends LogHistory>(history: T, data: LogHistoryData): T {
  histories.add(history);
  dataByHistory.set(history, Object.freeze(data));
  return history;
}
