import type { ListAction, ListControlAction } from '../ui-model/list.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type {
  ListCollection,
  ListCollectionRecord,
  ListItemProjection,
  ListItemProjector
} from '../ui-model/list.ts';
import { completeCollection, windowedCollection } from '../ui-model/collection.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';

interface ListStateBase {
  readonly selectedId?: string;
}

export interface PassiveListState extends ListStateBase {
  readonly scroll?: never;
}

export interface ScrollableListState extends ListStateBase {
  readonly scroll: ScrollState;
}

export type ListState = PassiveListState | ScrollableListState;

interface ListReducerOptionsBase {
  readonly filterQuery?: string;
}

export type ListReducerOptions<TValue> = ListReducerOptionsBase & (
  | {
      readonly items: readonly TValue[];
      readonly projectItem: ListItemProjector<TValue>;
      readonly collection?: never;
    }
  | {
      readonly collection: ListCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
    }
);

export interface ListPresentation {
  readonly selectedId?: string;
}

export interface ListScrollablePresentation extends ListPresentation {
  readonly scroll: ScrollState;
}

export interface ListVisibleEntry<TValue> {
  readonly id: string;
  readonly sourceIndex: number;
  readonly visibleIndex: number;
  readonly selectableIndex?: number;
  readonly value: TValue;
  readonly item: ListCollectionRecord<TValue>['item'];
}

interface ListViewIndex<TValue> {
  readonly query: string;
  readonly visible: readonly ListVisibleEntry<TValue>[];
  readonly selectable: readonly ListVisibleEntry<TValue>[];
  readonly selectablePositions: ReadonlyMap<string, number>;
  readonly scrollPositions: ReadonlyMap<string, number>;
}

const listViewIndexes = new WeakMap<object, ListViewIndex<unknown>>();

export function listReducer<TValue>(
  state: ScrollableListState,
  action: ListAction,
  options: ListReducerOptions<TValue>
): ScrollableListState;
export function listReducer<TValue>(
  state: PassiveListState,
  action: ListControlAction,
  options: ListReducerOptions<TValue>
): PassiveListState;
export function listReducer<TValue>(
  state: ListState,
  action: ListAction,
  options: ListReducerOptions<TValue>
): ListState {
  if (action.kind === 'scroll') {
    return state.scroll === undefined
      ? state
      : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
  if (action.kind === 'activate') return state;
  const collection = collectionForListOptions(options);
  const view = listViewIndex(collection, options.filterQuery);
  const { selectable } = view;
  if (selectable.length === 0) return withoutSelection(state);
  const selectedId = selectedIdForAction(state.selectedId, action, view, state.scroll?.viewportRows);
  if (selectedId === undefined) return state;
  const scrollIndex = view.scrollPositions.get(selectedId);
  const scroll = state.scroll === undefined || scrollIndex === undefined
    ? state.scroll
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: scrollIndex });
  return state.selectedId === selectedId && state.scroll === scroll
    ? state
    : {
        selectedId,
        ...(scroll === undefined ? {} : { scroll })
      };
}

export function listPresentation(state: PassiveListState): ListPresentation {
  return listPresentationBase(state);
}

export function listScrollablePresentation(state: ScrollableListState): ListScrollablePresentation {
  return { ...listPresentationBase(state), scroll: state.scroll };
}

function listPresentationBase(state: ListStateBase): ListPresentation {
  return {
    ...(state.selectedId === undefined ? {} : { selectedId: state.selectedId })
  };
}

export function visibleListEntries<TValue>(options: ListReducerOptions<TValue>): readonly ListVisibleEntry<TValue>[] {
  const collection = collectionForListOptions(options);
  return listViewIndex(collection, options.filterQuery).visible;
}

export function prepareListCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListItemProjector<TValue>,
  window?: CollectionWindow
): ListCollection<TValue> {
  const start = window?.start ?? 0;
  const records = values.map((value, offset): ListCollectionRecord<TValue> => {
    const index = start + offset;
    const item = normalizedListItem(projectItem(value, index));
    return { id: item.id, index, value, item };
  });
  return window === undefined
    ? completeCollection(records)
    : windowedCollection({ records, window });
}

function collectionForListOptions<TValue>(options: ListReducerOptions<TValue>): ListCollection<TValue> {
  return options.collection ?? prepareListCollection(options.items, options.projectItem);
}

function normalizedListItem(item: ListItemProjection): ListCollectionRecord<unknown>['item'] {
  return Object.freeze({
    ...item,
    ...(item.keywords === undefined ? {} : { keywords: Object.freeze([...item.keywords]) }),
    disabled: item.disabled === true
  });
}

function selectedIdForAction<TValue>(
  current: string | undefined,
  action: Exclude<ListAction, { readonly kind: 'scroll' | 'activate' }>,
  view: ListViewIndex<TValue>,
  viewportRows = 1
): string | undefined {
  const { selectable } = view;
  if (action.kind === 'select') return view.selectablePositions.has(action.id) ? action.id : current;
  if (action.kind === 'first') return selectable[0]?.item.id;
  if (action.kind === 'last') return selectable.at(-1)?.item.id;
  const delta = action.kind === 'page'
    ? action.delta * Math.max(1, viewportRows)
    : action.delta;
  const currentPosition = current === undefined ? undefined : view.selectablePositions.get(current);
  if (currentPosition === undefined) return delta < 0 ? selectable.at(-1)?.item.id : selectable[0]?.item.id;
  return selectable[wrapIndex(currentPosition + delta, selectable.length)]?.item.id;
}

function listViewIndex<TValue>(
  collection: ListCollection<TValue>,
  filterQuery: string | undefined
): ListViewIndex<TValue> {
  const query = (filterQuery ?? '').trim().toLocaleLowerCase();
  if (collection.kind === 'window' && query.length > 0) {
    throw new TypeError('windowed list collections must be filtered before they are prepared.');
  }
  const cached = listViewIndexes.get(collection) as ListViewIndex<TValue> | undefined;
  if (cached?.query === query) return cached;
  const visibleRecords = collection.records.filter(({ item }) =>
    query.length === 0 || listItemSearchText(item).includes(query)
  );
  const selectablePositions = new Map<string, number>();
  let selectableIndex = 0;
  const visible = Object.freeze(visibleRecords.map((entry, visibleIndex): ListVisibleEntry<TValue> => {
    const selectable = entry.item.disabled ? undefined : selectableIndex++;
    if (selectable !== undefined) selectablePositions.set(entry.id, selectable);
    return Object.freeze({
      id: entry.id,
      sourceIndex: entry.index,
      visibleIndex,
      ...(selectable === undefined ? {} : { selectableIndex: selectable }),
      value: entry.value,
      item: entry.item
    });
  }));
  const selectable = Object.freeze(visible.filter((entry) => entry.selectableIndex !== undefined));
  const scrollPositions = new Map(visible.map((entry) => [
    entry.id,
    collection.kind === 'window' ? entry.sourceIndex : entry.visibleIndex
  ]));
  const index = Object.freeze({ query, visible, selectable, selectablePositions, scrollPositions });
  listViewIndexes.set(collection, index);
  return index;
}

function listItemSearchText(item: ListItemProjection): string {
  return [item.label, item.description, ...(item.keywords ?? [])]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLocaleLowerCase();
}

function withoutSelection(state: ListState): ListState {
  return state.selectedId === undefined ? state : state.scroll === undefined ? {} : { scroll: state.scroll };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
