const collectionProjectionBrand: unique symbol = Symbol('terminal-ui.collection-projection');

export interface CollectionRecord {
  readonly id: string;
  readonly itemIndex: number;
}

interface CollectionProjectionBase<TRecord extends CollectionRecord> {
  readonly [collectionProjectionBrand]: true;
  readonly records: readonly TRecord[];
  readonly startIndex: number;
  readonly totalCount: number;
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

export function completeCollection<TRecord extends CollectionRecord>(
  records: readonly TRecord[]
): CompleteCollectionProjection<TRecord> {
  const immutableRecords = immutableCollectionRecords(records, 0, records.length);
  return Object.freeze<CompleteCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'complete',
    records: immutableRecords,
    startIndex: 0,
    totalCount: immutableRecords.length
  });
}

export function windowedCollection<TRecord extends CollectionRecord>(input: {
  readonly records: readonly TRecord[];
  readonly window: CollectionWindow;
}): WindowedCollectionProjection<TRecord> {
  const startIndex = requireNonNegativeSafeInteger(input.window.startIndex, 'collection window startIndex');
  const totalCount = requireNonNegativeSafeInteger(input.window.totalCount, 'collection totalCount');
  if (startIndex > totalCount) throw new RangeError('collection window startIndex must not exceed its totalCount.');
  if (input.records.length > totalCount - startIndex) {
    throw new RangeError('collection window records must fit inside its declared total.');
  }
  const immutableRecords = immutableCollectionRecords(input.records, startIndex, totalCount);
  return Object.freeze<WindowedCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'window',
    records: immutableRecords,
    startIndex,
    totalCount,
    domain: normalizeWindowDomain(input.window.domain)
  });
}

export function isWindowedCollection<TRecord extends CollectionRecord>(
  projection: CollectionProjection<TRecord>
): projection is WindowedCollectionProjection<TRecord> {
  return projection.kind === 'window';
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
