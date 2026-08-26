import type {
  ListboxCollection,
  ListboxViewEntry,
  ListboxView,
} from './listbox.ts';
import { compileCollectionQuery, indexQueryCandidate, queryIndexedCandidates } from '../text/query.ts';
import { createCollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { CollectionQuery, CompiledCollectionQuery } from '../text/query.ts';

interface ListboxViewIndex<TValue> {
  readonly view: ListboxView<TValue>;
  readonly selectablePositions: ReadonlyMap<string, number>;
  readonly scrollPositions: ReadonlyMap<string, number>;
}

const views = new WeakMap<object, Map<string, ListboxViewIndex<unknown>>>();

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

export function listboxViewSelectablePosition<TValue>(
  view: ListboxView<TValue>,
  id: string,
): number | undefined {
  return viewIndex(view.source, view.query).selectablePositions.get(id);
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
  const visibleItems = query.text.length === 0
    ? collection.items
    : matchedItems(collection, query);

  function matchedItems(
    source: ListboxCollection<TValue>,
    compiledQuery: CompiledCollectionQuery,
  ): readonly ListboxCollection<TValue>['items'][number][] {
    const items = new Map(source.items.map((item) => [item.id, item] as const));
    return queryIndexedCandidates(source.items.map((item) => indexQueryCandidate({
        id: item.id,
        primary: item.option.label,
        secondary: [
          item.option.description,
          ...(item.option.keywords ?? []),
        ].filter((value): value is string => value !== undefined),
        ...(item.sectionId === undefined ? {} : { group: item.sectionId }),
      })), compiledQuery).flatMap((match) => {
        const item = items.get(match.id);
        return item === undefined ? [] : [item];
      });
  }
  const selectablePositions = new Map<string, number>();
  const scrollPositions = new Map<string, number>();
  let selectableIndex = 0;
  const entries = Object.freeze(visibleItems.map((item, visibleIndex): ListboxViewEntry<TValue> => {
    const selectable = item.option.disabled ? undefined : selectableIndex++;
    if (selectable !== undefined) selectablePositions.set(item.id, selectable);
    scrollPositions.set(item.id, collection.kind === 'window' ? item.itemIndex : visibleIndex);
    return Object.freeze({
      id: item.id,
      itemIndex: item.itemIndex,
      visibleIndex,
      ...(selectable === undefined ? {} : { selectableIndex: selectable }),
      value: item.value,
      option: item.option,
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
  const index = Object.freeze({ view, selectablePositions, scrollPositions });
  retainView(byQuery, key, index);
  return index;
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
