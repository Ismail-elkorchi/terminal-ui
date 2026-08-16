const collectionProjectionBrand: unique symbol = Symbol('terminal-ui.collection-projection');

import { prepareCollectionQuery } from '../text/query.ts';
import type { CollectionQuery, PreparedCollectionQuery } from '../text/query.ts';

export interface CollectionRecord {
  readonly id: string;
  readonly itemIndex: number;
  readonly sectionId?: string;
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
  readonly domain: CollectionWindowDomainInput;
}

export type CollectionWindowDomain =
  | { readonly kind: 'source' }
  | {
      readonly kind: 'projection';
      readonly query?: PreparedCollectionQuery;
    };

export type CollectionWindowDomainInput =
  | { readonly kind: 'source' }
  | {
      readonly kind: 'projection';
      readonly query?: CollectionQuery;
    };

interface CollectionIdentityIndex {
  readonly ids: readonly string[];
  readonly byId: ReadonlyMap<string, CollectionRecord>;
}

const collectionIdentityIndexes = new WeakMap<object, CollectionIdentityIndex>();
const collectionProjections = new WeakSet<object>();

export function completeCollection<TRecord extends CollectionRecord>(
  records: readonly TRecord[],
): CompleteCollectionProjection<TRecord> {
  const immutableRecords = immutableCollectionRecords(records, 0, records.length);
  return registerCollectionProjection(Object.freeze<CompleteCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'complete',
    records: immutableRecords,
    startIndex: 0,
    totalCount: immutableRecords.length,
  }));
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
  return registerCollectionProjection(Object.freeze<WindowedCollectionProjection<TRecord>>({
    [collectionProjectionBrand]: true,
    kind: 'window',
    records: immutableRecords,
    startIndex,
    totalCount,
    domain: normalizeWindowDomain(input.window.domain),
  }));
}

export function isCollectionProjection(
  value: unknown
): value is CollectionProjection<CollectionRecord> {
  return collectionProjections.has(value as object);
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

function registerCollectionProjection<T extends CollectionProjection<CollectionRecord>>(
  projection: T,
): T {
  collectionProjections.add(projection);
  return projection;
}

function immutableCollectionRecords<TRecord extends CollectionRecord>(
  records: readonly TRecord[],
  start: number,
  total: number
): readonly TRecord[] {
  const seen = new Set<string>();
  return Object.freeze(records.map((record, offset): TRecord => {
    const expectedIndex = start + offset;
    if (typeof record.id !== 'string' || record.id.length === 0) {
      throw new TypeError('collection record ids must not be empty.');
    }
    if (seen.has(record.id)) {
      throw new TypeError(`collection record ids must be unique; duplicate id: ${record.id}`);
    }
    if (!Number.isSafeInteger(record.itemIndex)
      || record.itemIndex !== expectedIndex
      || record.itemIndex >= total) {
      throw new RangeError(`collection record itemIndex must equal its stable position: ${String(expectedIndex)}.`);
    }
    if (record.sectionId !== undefined && (typeof record.sectionId !== 'string' || record.sectionId.length === 0)) {
      throw new TypeError('collection record sectionId must be a non-empty string.');
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

function normalizeWindowDomain(domain: CollectionWindowDomainInput): CollectionWindowDomain {
  if (domain.kind === 'source') return Object.freeze({ kind: 'source' });
  const query = domain.query === undefined ? undefined : prepareCollectionQuery(domain.query);
  return Object.freeze({
    kind: 'projection',
    ...(query === undefined || query.text.length === 0 ? {} : { query }),
  });
}
