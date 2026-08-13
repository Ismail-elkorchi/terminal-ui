import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxViewEntry,
  PreparedListboxView,
  WindowedListboxCollection,
} from './list.ts';
import { normalizeCollectionQuery, queryNormalizedCandidates } from './query.ts';
import type { CollectionQuery } from './query.ts';

interface ListboxViewIndex<TValue> {
  readonly view: PreparedListboxView<TValue>;
  readonly selectablePositions: ReadonlyMap<string, number>;
  readonly scrollPositions: ReadonlyMap<string, number>;
}

const views = new WeakMap<object, Map<string, ListboxViewIndex<unknown>>>();

export function prepareListboxView<TValue>(
  collection: CompleteListboxCollection<TValue>,
  options?: { readonly filterQuery?: CollectionQuery },
): PreparedListboxView<TValue>;
export function prepareListboxView<TValue>(
  collection: WindowedListboxCollection<TValue>,
): PreparedListboxView<TValue>;
export function prepareListboxView<TValue>(
  collection: ListboxCollection<TValue>,
  options: { readonly filterQuery?: CollectionQuery } = {},
): PreparedListboxView<TValue> {
  const query = queryFor(collection, options.filterQuery);
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
  query: Required<CollectionQuery>,
): ListboxViewIndex<TValue> {
  let byQuery = views.get(collection);
  if (byQuery === undefined) {
    byQuery = new Map();
    views.set(collection, byQuery);
  }
  const key = queryKey(query);
  const cached = byQuery.get(key) as ListboxViewIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const records = new Map(collection.records.map((record) => [record.id, record] as const));
  const matches = queryNormalizedCandidates(collection.records.map((record) => ({
    id: record.id,
    primary: record.item.label,
    secondary: [
      record.item.description,
      ...(record.item.keywords ?? []),
    ].filter((value): value is string => value !== undefined),
    ...(record.sectionId === undefined ? {} : { group: record.sectionId }),
  })), query);
  const visibleRecords = query.text.length === 0
    ? collection.records
    : matches.flatMap((match) => {
        const record = records.get(match.id);
        return record === undefined ? [] : [record];
      });
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
    startIndex: collection.kind === 'window' ? collection.startIndex : 0,
    totalCount: collection.kind === 'window' ? collection.totalCount : entries.length,
  });
  const index = Object.freeze({ view, selectablePositions, scrollPositions });
  byQuery.set(key, index);
  return index;
}

function queryFor<TValue>(
  collection: ListboxCollection<TValue>,
  filterQuery: CollectionQuery | undefined,
): Required<CollectionQuery> {
  if (collection.kind === 'window') {
    return normalizeCollectionQuery({
      text: collection.domain.kind === 'projection' ? collection.domain.filterQuery ?? '' : '',
      mode: 'contains',
    });
  }
  return normalizeCollectionQuery(filterQuery ?? { text: '', mode: 'contains' });
}

function queryKey(query: Required<CollectionQuery>): string {
  return `${query.mode}:${query.caseSensitive ? '1' : '0'}:${query.text}`;
}
