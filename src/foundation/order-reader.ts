import type { CollectionScanCursor } from './cooperative-work.ts';
export type { CollectionScanCursor } from './cooperative-work.ts';

declare const collectionOrderReaderBrand: unique symbol;

/** A persistent identity and order receipt. Item payloads must be immutable. */
export interface CollectionOrderReader<T> {
  readonly [collectionOrderReaderBrand]: T;
  readonly kind: 'ordered-source';
  readonly count: number;
  readonly enabledCount: number;
  readonly itemAt: (rank: number) => T | undefined;
  readonly itemById: (id: string) => T | undefined;
  readonly rank: (id: string) => number | undefined;
  readonly enabledAt: (rank: number) => T | undefined;
  readonly enabledRank: (id: string) => number | undefined;
  readonly window: (start: number, end: number) => readonly T[];
  readonly values: (start?: number, end?: number) => IterableIterator<T>;
}

export function createCollectionOrderScan<T>(reader: CollectionOrderReader<T>): CollectionScanCursor<T> {
  return readerData(reader).createScan() as CollectionScanCursor<T>;
}
// Private package-internal capability registry. Shape, casts and proxies cannot
// manufacture ownership, and authentication never invokes caller methods.
interface OwnedReaderData { readonly storageBytes: number; readonly createScan: () => CollectionScanCursor<unknown> }
const ownedReaders = new WeakMap<object, OwnedReaderData>();
export function ownCollectionOrderReader<T>(reader: Omit<CollectionOrderReader<T>, typeof collectionOrderReaderBrand>, storageBytes: number, createScan: () => CollectionScanCursor<T>): CollectionOrderReader<T> {
  const owned = Object.freeze(reader) as CollectionOrderReader<T>;
  ownedReaders.set(owned, { storageBytes, createScan });
  return owned;
}
export function assertCollectionOrderReader(value: unknown): asserts value is CollectionOrderReader<unknown> {
  readerData(value);
}
/** Logical retained storage estimate; excludes shared payloads, not a heap limit. */
export function collectionOrderReaderStorageBytes(reader: CollectionOrderReader<unknown>): number {
  return readerData(reader).storageBytes;
}

function readerData(value: unknown): OwnedReaderData {
  const data = ownedReaders.get(value as object);
  if (data === undefined) throw new TypeError('Collection order readers must be created by terminal-ui.');
  return data;
}
