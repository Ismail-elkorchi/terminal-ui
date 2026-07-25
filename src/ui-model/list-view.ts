import { sanitizeTerminalText } from '../text/index.ts';
import type {
  CompleteListCollection,
  ListCollection,
  ListCollectionRecord,
  ListItemProjection,
  ListViewEntry,
  PreparedListView,
  WindowedListCollection
} from './list.ts';

interface ListViewIndex<TValue> {
  readonly view: PreparedListView<TValue>;
  readonly selectablePositions: ReadonlyMap<string, number>;
  readonly scrollPositions: ReadonlyMap<string, number>;
}

const views = new WeakMap<object, Map<string, ListViewIndex<unknown>>>();

export function prepareListView<TValue>(
  collection: CompleteListCollection<TValue>,
  options?: { readonly filterQuery?: string }
): PreparedListView<TValue>;
export function prepareListView<TValue>(
  collection: WindowedListCollection<TValue>
): PreparedListView<TValue>;
export function prepareListView<TValue>(
  collection: ListCollection<TValue>,
  options: { readonly filterQuery?: string } = {}
): PreparedListView<TValue> {
  const query = queryFor(collection, options.filterQuery);
  return viewIndex(collection, query).view;
}

export function listViewSelectablePosition<TValue>(
  view: PreparedListView<TValue>,
  id: string
): number | undefined {
  return viewIndex(view.source, view.query).selectablePositions.get(id);
}

export function listViewScrollPosition<TValue>(
  view: PreparedListView<TValue>,
  id: string
): number | undefined {
  return viewIndex(view.source, view.query).scrollPositions.get(id);
}

function viewIndex<TValue>(collection: ListCollection<TValue>, query: string): ListViewIndex<TValue> {
  let byQuery = views.get(collection);
  if (byQuery === undefined) {
    byQuery = new Map();
    views.set(collection, byQuery);
  }
  const cached = byQuery.get(query) as ListViewIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const visibleRecords = collection.records.flatMap((record): readonly ListCollectionRecord<TValue>[] =>
    query.length === 0 || listItemSearchText(record.item).includes(query) ? [record] : []
  );
  const selectablePositions = new Map<string, number>();
  const scrollPositions = new Map<string, number>();
  let selectableIndex = 0;
  const entries = Object.freeze(visibleRecords.map((record, visibleIndex): ListViewEntry<TValue> => {
    const selectable = record.item.disabled ? undefined : selectableIndex++;
    if (selectable !== undefined) selectablePositions.set(record.id, selectable);
    scrollPositions.set(record.id, collection.kind === 'window' ? record.itemIndex : visibleIndex);
    return Object.freeze({
      id: record.id,
      sourceIndex: record.itemIndex,
      visibleIndex,
      ...(selectable === undefined ? {} : { selectableIndex: selectable }),
      value: record.value,
      item: record.item
    });
  }));
  const selectable = Object.freeze(entries.filter((entry) => entry.selectableIndex !== undefined));
  const view = Object.freeze({
    kind: 'list-view' as const,
    source: collection,
    query,
    entries,
    selectable,
    startIndex: collection.kind === 'window' ? collection.startIndex : 0,
    totalCount: collection.kind === 'window' ? collection.totalCount : entries.length
  });
  const index = Object.freeze({ view, selectablePositions, scrollPositions });
  byQuery.set(query, index);
  return index;
}

function queryFor<TValue>(collection: ListCollection<TValue>, filterQuery: string | undefined): string {
  if (collection.kind === 'window') {
    return collection.domain.kind === 'projection'
      ? normalizedQuery(collection.domain.filterQuery)
      : '';
  }
  return normalizedQuery(filterQuery);
}

function normalizedQuery(query: string | undefined): string {
  return sanitizeTerminalText(query ?? '').text.trim().toLocaleLowerCase();
}

function listItemSearchText(item: ListItemProjection): string {
  return [item.label, item.description, ...(item.keywords ?? [])]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLocaleLowerCase();
}
