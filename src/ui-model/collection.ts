
const collectionProjectionBrand: unique symbol = Symbol('terminal-ui.collection-projection');

export interface CollectionRecord {
  readonly id: string;
  readonly itemIndex: number;
  /** Changes when the logical item is replaced while retaining its stable id. */
  readonly version?: string | number;
  readonly sectionId?: string;
  /** Optional row estimate for virtualized variable-height collections. */
  readonly estimatedRows?: number;
}

export interface CollectionSection {
  readonly id: string;
  readonly label: string;
}

export type CollectionStatus =
  | { readonly kind: 'ready' }
  | { readonly kind: 'loading'; readonly direction?: 'initial' | 'before' | 'after' }
  | { readonly kind: 'error'; readonly message: string; readonly retryId?: string };

export interface CollectionMetadata {
  readonly version?: string | number;
  readonly status?: CollectionStatus;
  readonly sections?: readonly CollectionSection[];
}

interface CollectionProjectionBase<TRecord extends CollectionRecord> {
  readonly [collectionProjectionBrand]: true;
  readonly records: readonly TRecord[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly version?: string | number;
  readonly status: CollectionStatus;
  readonly sections: readonly CollectionSection[];
}

export interface CompleteCollectionProjection<TRecord extends CollectionRecord>
  extends CollectionProjectionBase<TRecord> {
  readonly kind: 'complete';
  readonly startIndex: 0;
}

export interface WindowedCollectionProjection<TRecord extends CollectionRecord>
  extends CollectionProjectionBase<TRecord> {
  readonly kind: 'window';
  readonly domain: CollectionWindowDomain;
}

export type CollectionProjection<TRecord extends CollectionRecord> =
  | CompleteCollectionProjection<TRecord>
  | WindowedCollectionProjection<TRecord>;

export interface SparseCollectionProjection<TRecord extends CollectionRecord> {
  readonly [collectionProjectionBrand]: true;
  readonly kind: 'sparse';
  readonly records: readonly TRecord[];
  readonly totalCount: number;
  readonly version?: string | number;
  readonly status: CollectionStatus;
  readonly sections: readonly CollectionSection[];
}

export interface CursorCollectionProjection<TRecord extends CollectionRecord> {
  readonly [collectionProjectionBrand]: true;
  readonly kind: 'cursor';
  readonly records: readonly TRecord[];
  readonly page: {
    readonly before?: string;
    readonly after?: string;
    readonly hasPrevious: boolean;
    readonly hasNext: boolean;
  };
  readonly version?: string | number;
  readonly status: CollectionStatus;
  readonly sections: readonly CollectionSection[];
}

export type AnyCollectionProjection<TRecord extends CollectionRecord> =
  | CollectionProjection<TRecord>
  | SparseCollectionProjection<TRecord>
  | CursorCollectionProjection<TRecord>;

export interface CollectionWindow {
  readonly startIndex: number;
  readonly totalCount: number;
  readonly domain: CollectionWindowDomain;
}

export type CollectionWindowDomain =
  | { readonly kind: 'source' }
  | {
      readonly kind: 'projection';
      readonly id: string;
      readonly filterQuery?: string;
      readonly sort?: { readonly key: string; readonly direction: 'ascending' | 'descending' };
    };

interface CollectionIdentityIndex {
  readonly ids: readonly string[];
  readonly byId: ReadonlyMap<string, CollectionRecord>;
}

const collectionIdentityIndexes = new WeakMap<object, CollectionIdentityIndex>();
const collectionProjections = new WeakSet<object>();
const allCollectionProjections = new WeakSet<object>();

export function completeCollection<TRecord extends CollectionRecord>(
  records: readonly TRecord[],
  metadata: CollectionMetadata = {},
): CompleteCollectionProjection<TRecord> {
  const immutableRecords = immutableCollectionRecords(records, 0, records.length);
  return registerCollectionProjection(Object.freeze<CompleteCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true as const,
    kind: 'complete',
    records: immutableRecords,
    startIndex: 0,
    totalCount: immutableRecords.length,
    ...normalizeCollectionMetadata(metadata),
  }), true);
}

export function windowedCollection<TRecord extends CollectionRecord>(input: {
  readonly records: readonly TRecord[];
  readonly window: CollectionWindow;
  readonly metadata?: CollectionMetadata;
}): WindowedCollectionProjection<TRecord> {
  const startIndex = requireNonNegativeSafeInteger(input.window.startIndex, 'collection window startIndex');
  const totalCount = requireNonNegativeSafeInteger(input.window.totalCount, 'collection totalCount');
  if (startIndex > totalCount) throw new RangeError('collection window startIndex must not exceed its totalCount.');
  if (input.records.length > totalCount - startIndex) {
    throw new RangeError('collection window records must fit inside its declared total.');
  }
  const immutableRecords = immutableCollectionRecords(input.records, startIndex, totalCount);
  return registerCollectionProjection(Object.freeze<WindowedCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true as const,
    kind: 'window',
    records: immutableRecords,
    startIndex,
    totalCount,
    domain: normalizeWindowDomain(input.window.domain),
    ...normalizeCollectionMetadata(input.metadata ?? {}),
  }), true);
}

export function sparseCollection<TRecord extends CollectionRecord>(input: {
  readonly records: readonly TRecord[];
  readonly totalCount: number;
  readonly metadata?: CollectionMetadata;
}): SparseCollectionProjection<TRecord> {
  const totalCount = requireNonNegativeSafeInteger(input.totalCount, 'sparse collection totalCount');
  const records = immutableSparseRecords(input.records, totalCount);
  return registerCollectionProjection(Object.freeze<SparseCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'sparse',
    records,
    totalCount,
    ...normalizeCollectionMetadata(input.metadata ?? {}),
  }), false);
}

export function cursorCollection<TRecord extends CollectionRecord>(input: {
  readonly records: readonly TRecord[];
  readonly page: CursorCollectionProjection<TRecord>['page'];
  readonly metadata?: CollectionMetadata;
}): CursorCollectionProjection<TRecord> {
  const records = immutableSparseRecords(input.records);
  const before = normalizedOptionalText(input.page.before, 'cursor collection before cursor');
  const after = normalizedOptionalText(input.page.after, 'cursor collection after cursor');
  if (typeof input.page.hasPrevious !== 'boolean' || typeof input.page.hasNext !== 'boolean') {
    throw new TypeError('cursor collection page flags must be booleans.');
  }
  return registerCollectionProjection(Object.freeze<CursorCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'cursor',
    records,
    page: Object.freeze({
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
      hasPrevious: input.page.hasPrevious,
      hasNext: input.page.hasNext,
    }),
    ...normalizeCollectionMetadata(input.metadata ?? {}),
  }), false);
}

export function isCollectionProjection(
  value: unknown
): value is CollectionProjection<CollectionRecord> {
  return typeof value === 'object' && value !== null && collectionProjections.has(value);
}

export function isAnyCollectionProjection(
  value: unknown,
): value is AnyCollectionProjection<CollectionRecord> {
  return typeof value === 'object' && value !== null && allCollectionProjections.has(value);
}

function registerCollectionProjection<T extends AnyCollectionProjection<CollectionRecord>>(
  projection: T,
  supportsInteraction: boolean,
): T {
  allCollectionProjections.add(projection);
  if (supportsInteraction) collectionProjections.add(projection);
  return projection;
}

export function collectionIds<TRecord extends CollectionRecord>(
  projection: CollectionProjection<TRecord>
): readonly string[] {
  return identityIndex(projection).ids;
}

export function collectionRecordById<TRecord extends CollectionRecord>(
  projection: CollectionProjection<TRecord>,
  id: string
): TRecord | undefined {
  return identityIndex(projection).byId.get(id) as TRecord | undefined;
}

function immutableCollectionRecords<TRecord extends CollectionRecord>(
  records: readonly TRecord[],
  start: number,
  total: number
): readonly TRecord[] {
  const seen = new Set<string>();
  return Object.freeze(records.map((record, offset): TRecord => {
    const expectedIndex = start + offset;
    if (record.id.length === 0) throw new TypeError('collection record ids must not be empty.');
    if (seen.has(record.id)) {
      throw new TypeError(`collection record ids must be unique; duplicate id: ${record.id}`);
    }
    if (!Number.isSafeInteger(record.itemIndex)
      || record.itemIndex !== expectedIndex
      || record.itemIndex >= total) {
      throw new RangeError(`collection record itemIndex must equal its stable position: ${String(expectedIndex)}.`);
    }
    seen.add(record.id);
    return Object.freeze({ ...record });
  }));
}

function immutableSparseRecords<TRecord extends CollectionRecord>(
  records: readonly TRecord[],
  total?: number,
): readonly TRecord[] {
  const seenIds = new Set<string>();
  const seenIndexes = new Set<number>();
  let previous = -1;
  return Object.freeze(records.map((record) => {
    const prepared = immutableRecord(record);
    if (seenIds.has(prepared.id)) throw new TypeError(`collection record ids must be unique; duplicate id: ${prepared.id}`);
    if (seenIndexes.has(prepared.itemIndex) || prepared.itemIndex <= previous) {
      throw new RangeError('sparse collection itemIndex values must be unique and ascending.');
    }
    if (total !== undefined && prepared.itemIndex >= total) {
      throw new RangeError('sparse collection itemIndex must be less than totalCount.');
    }
    seenIds.add(prepared.id);
    seenIndexes.add(prepared.itemIndex);
    previous = prepared.itemIndex;
    return prepared;
  }));
}

function immutableRecord<TRecord extends CollectionRecord>(record: TRecord): TRecord {
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new TypeError('collection record ids must not be empty.');
  }
  if (!Number.isSafeInteger(record.itemIndex) || record.itemIndex < 0) {
    throw new RangeError('collection record itemIndex must be a non-negative safe integer.');
  }
  if (record.estimatedRows !== undefined &&
    (!Number.isSafeInteger(record.estimatedRows) || record.estimatedRows < 1)) {
    throw new RangeError('collection record estimatedRows must be a positive safe integer.');
  }
  return Object.freeze({ ...record });
}

function identityIndex<TRecord extends CollectionRecord>(
  projection: CollectionProjection<TRecord>
): CollectionIdentityIndex {
  const cached = collectionIdentityIndexes.get(projection);
  if (cached !== undefined) return cached;
  const ids = Object.freeze(projection.records.map((record) => record.id));
  const byId = new Map<string, CollectionRecord>(projection.records.map((record) => [record.id, record]));
  const index = Object.freeze({ ids, byId });
  collectionIdentityIndexes.set(projection, index);
  return index;
}

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizeWindowDomain(domain: CollectionWindowDomain): CollectionWindowDomain {
  if (domain.kind === 'source') return Object.freeze({ kind: 'source' });
  const id = domain.id.trim();
  if (id.length === 0) throw new TypeError('projected collection window domain id must not be empty.');
  const filterQuery = domain.filterQuery?.trim();
  const sort = normalizeWindowSort(domain.sort);
  return Object.freeze({
    kind: 'projection',
    id,
    ...(filterQuery === undefined || filterQuery.length === 0 ? {} : { filterQuery }),
    ...(sort === undefined ? {} : { sort })
  });
}

function normalizeWindowSort(
  sort: Extract<CollectionWindowDomain, { readonly kind: 'projection' }>['sort']
): NonNullable<Extract<CollectionWindowDomain, { readonly kind: 'projection' }>['sort']> | undefined {
  if (sort === undefined) return undefined;
  const key = sort.key.trim();
  if (key.length === 0) throw new TypeError('projected collection window sort key must not be empty.');
  return Object.freeze({ key, direction: sort.direction });
}

function normalizeCollectionMetadata(metadata: CollectionMetadata): {
  readonly version?: string | number;
  readonly status: CollectionStatus;
  readonly sections: readonly CollectionSection[];
} {
  const status = normalizeCollectionStatus(metadata.status);
  const sectionIds = new Set<string>();
  const sections = Object.freeze((metadata.sections ?? []).map((section) => {
    const id = normalizedOptionalText(section.id, 'collection section id');
    const label = normalizedOptionalText(section.label, 'collection section label');
    if (id === undefined || label === undefined) throw new TypeError('collection sections require id and label.');
    if (sectionIds.has(id)) throw new TypeError(`collection section ids must be unique; duplicate id: ${id}`);
    sectionIds.add(id);
    return Object.freeze({ id, label });
  }));
  return {
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
    status,
    sections,
  };
}

function normalizeCollectionStatus(status: CollectionStatus | undefined): CollectionStatus {
  if (status === undefined || status.kind === 'ready') return Object.freeze({ kind: 'ready' });
  if (status.kind === 'loading') {
    if (status.direction !== undefined && !['initial', 'before', 'after'].includes(status.direction)) {
      throw new TypeError('collection loading direction is invalid.');
    }
    return Object.freeze({ kind: 'loading', ...(status.direction === undefined ? {} : { direction: status.direction }) });
  }
  const message = normalizedOptionalText(status.message, 'collection error message');
  if (message === undefined) throw new TypeError('collection errors require a message.');
  const retryId = normalizedOptionalText(status.retryId, 'collection retry id');
  return Object.freeze({ kind: 'error', message, ...(retryId === undefined ? {} : { retryId }) });
}

function normalizedOptionalText(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${label} must not be empty.`);
  return normalized;
}
