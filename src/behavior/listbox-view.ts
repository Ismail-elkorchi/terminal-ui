import type {
  ListboxCollection,
  ListboxViewEntry,
  ListboxView,
} from './listbox.ts';
import { compileCollectionQuery, indexQueryCandidate, queryIndexedCandidates } from '../text/query.ts';
import { createCollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { CollectionQuery, CompiledCollectionQuery, IndexedQueryCandidate, QueryMatchRange } from '../text/query.ts';
import type { ListboxCollectionItem } from './listbox.ts';

interface ListboxViewIndex<TValue> {
  readonly view: ListboxView<TValue>;
  readonly scrollPositions: ReadonlyMap<string, number>;
}

const views = new WeakMap<object, Map<string, ListboxViewIndex<unknown>>>();
const indexedSources = new WeakMap<object, IndexedListboxSource<unknown>>();

interface IndexedListboxSource<TValue> {
  readonly itemsById: ReadonlyMap<string, ListboxCollectionItem<TValue>>;
  readonly candidates: readonly IndexedQueryCandidate[];
}

interface MatchedListboxItem<TValue> {
  readonly item: ListboxCollectionItem<TValue>;
  readonly matches?: readonly QueryMatchRange[];
}

export function createListboxView<TValue>(
  collection: ListboxCollection<TValue>,
  options?: { readonly query?: CollectionQuery },
): ListboxView<TValue> {
  if (collection.kind === 'window' && options?.query !== undefined) {
    throw new TypeError('Windowed listbox collections own their filter query.');
  }
  const query = queryFor(collection, options?.query);
  return viewIndex(collection, query).view;
}

export function listboxViewScrollPosition<TValue>(
  view: ListboxView<TValue>,
  id: string,
): number | undefined {
  return viewIndex(view.source, view.query).scrollPositions.get(id);
}

function viewIndex<TValue>(
  collection: ListboxCollection<TValue>,
  query: CompiledCollectionQuery,
): ListboxViewIndex<TValue> {
  let byQuery = views.get(collection);
  if (byQuery === undefined) {
    byQuery = new Map();
    views.set(collection, byQuery);
  }
  const key = queryKey(query);
  const cached = byQuery.get(key) as ListboxViewIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const visibleItems: readonly MatchedListboxItem<TValue>[] = collection.kind === 'window' || query.text.length === 0
    ? collection.items.map((item) => ({ item }))
    : matchedItems(collection, query);
  const scrollPositions = new Map<string, number>();
  let selectableIndex = 0;
  const entries = Object.freeze(visibleItems.map(({ item, matches }, visibleIndex): ListboxViewEntry<TValue> => {
    const selectable = item.option.disabled ? undefined : selectableIndex++;
    scrollPositions.set(item.id, collection.kind === 'window' ? item.itemIndex : visibleIndex);
    return Object.freeze({
      id: item.id,
      itemIndex: item.itemIndex,
      visibleIndex,
      ...(selectable === undefined ? {} : { selectableIndex: selectable }),
      value: item.value,
      option: item.option,
      ...(matches === undefined ? {} : { matches }),
    });
  }));
  const selectable = Object.freeze(entries.filter((entry) => entry.selectableIndex !== undefined));
  const view = Object.freeze({
    kind: 'listbox-view' as const,
    source: collection,
    query,
    entries,
    selectable,
    interactionIndex: createCollectionInteractionIndex(selectable.map((entry) => entry.id)),
    startIndex: collection.kind === 'window' ? collection.startIndex : 0,
    totalCount: collection.kind === 'window' ? collection.totalCount : entries.length,
  });
  const index = Object.freeze({ view, scrollPositions });
  retainView(byQuery, key, index);
  return index;
}

function matchedItems<TValue>(
  collection: ListboxCollection<TValue>,
  query: CompiledCollectionQuery,
): readonly MatchedListboxItem<TValue>[] {
  const source = indexedSource(collection);
  return queryIndexedCandidates(source.candidates, query).flatMap((match) => {
    const item = source.itemsById.get(match.id);
    if (item === undefined) return [];
    const matches = Object.freeze(match.ranges.filter((range) => range.field === 'primary'));
    return [{ item, ...(matches.length === 0 ? {} : { matches }) }];
  });
}

function indexedSource<TValue>(collection: ListboxCollection<TValue>): IndexedListboxSource<TValue> {
  const cached = indexedSources.get(collection) as IndexedListboxSource<TValue> | undefined;
  if (cached !== undefined) return cached;
  const itemsById = new Map<string, ListboxCollectionItem<TValue>>();
  const candidates = collection.items.map((item) => {
    itemsById.set(item.id, item);
    const { label, description, keywords } = item.option;
    return indexQueryCandidate({
      id: item.id,
      primary: label,
      secondary: [[label, description, ...(keywords ?? [])].filter(Boolean).join(' ')],
      ...(item.sectionId === undefined ? {} : { group: item.sectionId }),
    });
  });
  const source = Object.freeze({ itemsById, candidates: Object.freeze(candidates) });
  indexedSources.set(collection, source);
  return source;
}

function retainView(
  viewsByQuery: Map<string, ListboxViewIndex<unknown>>,
  key: string,
  index: ListboxViewIndex<unknown>,
): void {
  viewsByQuery.delete(key);
  viewsByQuery.set(key, index);
  let retainedReferences = [...viewsByQuery.values()]
    .reduce((total, entry) => total + entry.view.entries.length, 0);
  while (viewsByQuery.size > 1 && (viewsByQuery.size > 8 || retainedReferences > 8_192)) {
    const oldest = viewsByQuery.entries().next().value;
    if (oldest === undefined) break;
    viewsByQuery.delete(oldest[0]);
    retainedReferences -= oldest[1].view.entries.length;
  }
}

function queryFor<TValue>(
  collection: ListboxCollection<TValue>,
  requestedQuery: CollectionQuery | undefined,
): CompiledCollectionQuery {
  if (collection.kind === 'window') {
    return collection.scope.kind === 'query' && collection.scope.query !== undefined
      ? collection.scope.query
      : compileCollectionQuery({ text: '', mode: 'contains' });
  }
  return compileCollectionQuery(requestedQuery ?? { text: '', mode: 'contains' });
}

function queryKey(query: CompiledCollectionQuery): string {
  return `${query.mode}:${query.caseSensitive ? '1' : '0'}:${query.text}`;
}
