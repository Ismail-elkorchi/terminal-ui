const collectionSnapshotBrand: unique symbol = Symbol('terminal-ui.collection-snapshot');

import { compileCollectionQuery } from '../text/query.ts';
import type { CollectionQuery, CompiledCollectionQuery } from '../text/query.ts';

export interface CollectionItem {
  readonly id: string;
  readonly itemIndex: number;
  readonly sectionId?: string;
}

interface CollectionSnapshotBase<TItem extends CollectionItem> {
  readonly [collectionSnapshotBrand]: true;
  readonly items: readonly TItem[];
  readonly startIndex: number;
  readonly totalCount: number;
}

export interface CompleteCollectionSnapshot<TItem extends CollectionItem>
  extends CollectionSnapshotBase<TItem> {
  readonly kind: 'complete';
  readonly startIndex: 0;
}

export interface WindowedCollectionSnapshot<TItem extends CollectionItem>
  extends CollectionSnapshotBase<TItem> {
  readonly kind: 'window';
  readonly scope: CollectionWindowScope;
}

export type CollectionSnapshot<TItem extends CollectionItem> =
  | CompleteCollectionSnapshot<TItem>
  | WindowedCollectionSnapshot<TItem>;

export interface CollectionWindow {
  readonly startIndex: number;
  readonly totalCount: number;
  readonly scope: CollectionWindowScopeInput;
}

export type CollectionWindowScope =
  | { readonly kind: 'source' }
  | {
      readonly kind: 'query';
      readonly query?: CompiledCollectionQuery;
    };

export type CollectionWindowScopeInput =
  | { readonly kind: 'source' }
  | {
      readonly kind: 'query';
      readonly query?: CollectionQuery;
    };

interface CollectionIdentityIndex {
  readonly ids: readonly string[];
  readonly byId: ReadonlyMap<string, CollectionItem>;
}

const collectionIdentityIndexes = new WeakMap<object, CollectionIdentityIndex>();
const collectionSnapshots = new WeakSet<object>();

export function createCompleteCollection<TItem extends CollectionItem>(
  items: readonly TItem[],
): CompleteCollectionSnapshot<TItem> {
  const ownedItems = ownCollectionItems(items, 0, items.length);
  return registerCollectionSnapshot(Object.freeze<CompleteCollectionSnapshot<TItem>>({
    [collectionSnapshotBrand]: true,
    kind: 'complete',
    items: ownedItems,
    startIndex: 0,
    totalCount: ownedItems.length,
  }));
}

export function createWindowedCollection<TItem extends CollectionItem>(input: {
  readonly items: readonly TItem[];
  readonly window: CollectionWindow;
}): WindowedCollectionSnapshot<TItem> {
  const startIndex = requireNonNegativeSafeInteger(input.window.startIndex, 'collection window startIndex');
  const totalCount = requireNonNegativeSafeInteger(input.window.totalCount, 'collection totalCount');
  if (startIndex > totalCount) throw new RangeError('collection window startIndex must not exceed its totalCount.');
  if (input.items.length > totalCount - startIndex) {
    throw new RangeError('collection window items must fit inside its declared total.');
  }
  const ownedItems = ownCollectionItems(input.items, startIndex, totalCount);
  return registerCollectionSnapshot(Object.freeze<WindowedCollectionSnapshot<TItem>>({
    [collectionSnapshotBrand]: true,
    kind: 'window',
    items: ownedItems,
    startIndex,
    totalCount,
    scope: resolveWindowScope(input.window.scope),
  }));
}

export function isCollectionSnapshot(
  value: unknown
): value is CollectionSnapshot<CollectionItem> {
  return collectionSnapshots.has(value as object);
}

export function collectionIds<TItem extends CollectionItem>(
  snapshot: CollectionSnapshot<TItem>
): readonly string[] {
  return identityIndex(snapshot).ids;
}

export function collectionItemById<TItem extends CollectionItem>(
  snapshot: CollectionSnapshot<TItem>,
  id: string
): TItem | undefined {
  return identityIndex(snapshot).byId.get(id) as TItem | undefined;
}

function registerCollectionSnapshot<T extends CollectionSnapshot<CollectionItem>>(
  snapshot: T,
): T {
  collectionSnapshots.add(snapshot);
  return snapshot;
}

function ownCollectionItems<TItem extends CollectionItem>(
  items: readonly TItem[],
  start: number,
  total: number
): readonly TItem[] {
  const seen = new Set<string>();
  return Object.freeze(items.map((item, offset): TItem => {
    const expectedIndex = start + offset;
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new TypeError('collection item ids must not be empty.');
    }
    if (seen.has(item.id)) {
      throw new TypeError(`collection item ids must be unique; duplicate id: ${item.id}`);
    }
    if (!Number.isSafeInteger(item.itemIndex)
      || item.itemIndex !== expectedIndex
      || item.itemIndex >= total) {
      throw new RangeError(`collection itemIndex must equal its stable position: ${String(expectedIndex)}.`);
    }
    if (item.sectionId !== undefined && (typeof item.sectionId !== 'string' || item.sectionId.length === 0)) {
      throw new TypeError('collection item sectionId must be a non-empty string.');
    }
    seen.add(item.id);
    return Object.freeze({ ...item });
  }));
}

function identityIndex<TItem extends CollectionItem>(
  snapshot: CollectionSnapshot<TItem>
): CollectionIdentityIndex {
  const cached = collectionIdentityIndexes.get(snapshot);
  if (cached !== undefined) return cached;
  const ids = Object.freeze(snapshot.items.map((item) => item.id));
  const byId = new Map<string, CollectionItem>(snapshot.items.map((item) => [item.id, item]));
  const index = Object.freeze({ ids, byId });
  collectionIdentityIndexes.set(snapshot, index);
  return index;
}

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function resolveWindowScope(scope: CollectionWindowScopeInput): CollectionWindowScope {
  if (scope.kind === 'source') return Object.freeze({ kind: 'source' });
  const query = scope.query === undefined ? undefined : compileCollectionQuery(scope.query);
  return Object.freeze({
    kind: 'query',
    ...(query === undefined || query.text.length === 0 ? {} : { query }),
  });
}
