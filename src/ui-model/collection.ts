const collectionProjectionBrand: unique symbol = Symbol('terminal-ui.collection-projection');

export interface CollectionRecord {
  readonly id: string;
  readonly index: number;
}

interface CollectionProjectionBase<TRecord extends CollectionRecord> {
  readonly [collectionProjectionBrand]: true;
  readonly records: readonly TRecord[];
  readonly start: number;
  readonly total: number;
}

export interface CompleteCollectionProjection<TRecord extends CollectionRecord>
  extends CollectionProjectionBase<TRecord> {
  readonly kind: 'complete';
  readonly start: 0;
}

export interface WindowedCollectionProjection<TRecord extends CollectionRecord>
  extends CollectionProjectionBase<TRecord> {
  readonly kind: 'window';
}

export type CollectionProjection<TRecord extends CollectionRecord> =
  | CompleteCollectionProjection<TRecord>
  | WindowedCollectionProjection<TRecord>;

export interface CollectionWindow {
  readonly start: number;
  readonly total: number;
}

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
    start: 0,
    total: immutableRecords.length
  });
}

export function windowedCollection<TRecord extends CollectionRecord>(input: {
  readonly records: readonly TRecord[];
  readonly window: CollectionWindow;
}): WindowedCollectionProjection<TRecord> {
  const start = nonNegativeInteger(input.window.start, 'collection window start');
  const total = nonNegativeInteger(input.window.total, 'collection total');
  if (start > total) throw new RangeError('collection window start must not exceed its total.');
  if (input.records.length > total - start) {
    throw new RangeError('collection window records must fit inside its declared total.');
  }
  const immutableRecords = immutableCollectionRecords(input.records, start, total);
  return Object.freeze<WindowedCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'window',
    records: immutableRecords,
    start,
    total
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
    if (!Number.isSafeInteger(record.index) || record.index !== expectedIndex || record.index >= total) {
      throw new RangeError(`collection record index must equal its stable position: ${String(expectedIndex)}.`);
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

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}
