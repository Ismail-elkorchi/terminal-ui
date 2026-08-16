import type {
  ListboxCollection,
  ListboxViewEntry,
  PreparedListboxView,
} from './list.ts';
import { prepareCollectionQuery, prepareQueryCandidate, queryPreparedCandidates } from '../text/query.ts';
import { prepareCollectionInteractionIndex } from '../interaction/collection.ts';
import type { CollectionQuery, PreparedCollectionQuery } from '../text/query.ts';

interface ListboxViewIndex<TValue> {
  readonly view: PreparedListboxView<TValue>;
  readonly selectablePositions: ReadonlyMap<string, number>;
  readonly scrollPositions: ReadonlyMap<string, number>;
}

const views = new WeakMap<object, Map<string, ListboxViewIndex<unknown>>>();

export function prepareListboxView<TValue>(
  collection: ListboxCollection<TValue>,
  options?: { readonly query?: CollectionQuery },
): PreparedListboxView<TValue> {
  if (collection.kind === 'window' && options?.query !== undefined) {
    throw new TypeError('Windowed listbox collections own their filter query.');
  }
  const query = queryFor(collection, options?.query);
  return viewIndex(collection, query).view;
}

export function listboxViewSelectablePosition<TValue>(
  view: PreparedListboxView<TValue>,
  id: string,
): number | undefined {
  return viewIndex(view.source, view.query).selectablePositions.get(id);
}

export function listboxViewScrollPosition<TValue>(
  view: PreparedListboxView<TValue>,
  id: string,
): number | undefined {
  return viewIndex(view.source, view.query).scrollPositions.get(id);
}

function viewIndex<TValue>(
  collection: ListboxCollection<TValue>,
  query: PreparedCollectionQuery,
): ListboxViewIndex<TValue> {
  let byQuery = views.get(collection);
  if (byQuery === undefined) {
    byQuery = new Map();
    views.set(collection, byQuery);
  }
  const key = queryKey(query);
  const cached = byQuery.get(key) as ListboxViewIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const visibleRecords = query.text.length === 0
    ? collection.records
    : matchedRecords(collection, query);

  function matchedRecords(
    source: ListboxCollection<TValue>,
    normalizedQuery: PreparedCollectionQuery,
  ): readonly ListboxCollection<TValue>['records'][number][] {
    const records = new Map(source.records.map((record) => [record.id, record] as const));
    return queryPreparedCandidates(source.records.map((record) => prepareQueryCandidate({
        id: record.id,
        primary: record.item.label,
        secondary: [
          record.item.description,
          ...(record.item.keywords ?? []),
        ].filter((value): value is string => value !== undefined),
        ...(record.sectionId === undefined ? {} : { group: record.sectionId }),
      })), normalizedQuery).flatMap((match) => {
        const record = records.get(match.id);
        return record === undefined ? [] : [record];
      });
  }
  const selectablePositions = new Map<string, number>();
  const scrollPositions = new Map<string, number>();
  let selectableIndex = 0;
  const entries = Object.freeze(visibleRecords.map((record, visibleIndex): ListboxViewEntry<TValue> => {
    const selectable = record.item.disabled ? undefined : selectableIndex++;
    if (selectable !== undefined) selectablePositions.set(record.id, selectable);
    scrollPositions.set(record.id, collection.kind === 'window' ? record.itemIndex : visibleIndex);
    return Object.freeze({
      id: record.id,
      sourceIndex: record.itemIndex,
      visibleIndex,
      ...(selectable === undefined ? {} : { selectableIndex: selectable }),
      value: record.value,
      item: record.item,
    });
  }));
  const selectable = Object.freeze(entries.filter((entry) => entry.selectableIndex !== undefined));
  const view = Object.freeze({
    kind: 'listbox-view' as const,
    source: collection,
    query,
    entries,
    selectable,
    interactionIndex: prepareCollectionInteractionIndex(selectable.map((entry) => entry.id)),
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
): PreparedCollectionQuery {
  if (collection.kind === 'window') {
    return collection.domain.kind === 'projection' && collection.domain.query !== undefined
      ? collection.domain.query
      : prepareCollectionQuery({ text: '', mode: 'contains' });
  }
  return prepareCollectionQuery(requestedQuery ?? { text: '', mode: 'contains' });
}

function queryKey(query: PreparedCollectionQuery): string {
  return `${query.mode}:${query.caseSensitive ? '1' : '0'}:${query.text}`;
}
