import type { ListAction, ListControlAction } from '../ui-model/list.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type {
  CompleteListCollection,
  ListCollection,
  ListCollectionRecord,
  ListItemProjection,
  ListItemProjector,
  ListViewEntry,
  ListViewProjection,
  WindowedListCollection
} from '../ui-model/list.ts';
import {
  listViewScrollPosition,
  listViewSelectablePosition,
  prepareListView
} from '../ui-model/list-view.ts';
import { completeCollection, windowedCollection } from '../ui-model/collection.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';
import { sanitizeTerminalText } from '../text/index.ts';

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

export type ListReducerOptions<TValue> =
  | {
      readonly items: readonly TValue[];
      readonly projectItem: ListItemProjector<TValue>;
      readonly collection?: never;
      readonly filterQuery?: string;
    }
  | {
      readonly collection: CompleteListCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly filterQuery?: string;
    }
  | {
      readonly collection: WindowedListCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly filterQuery?: never;
    }
;

export interface ListPresentation {
  readonly selectedId?: string;
}

export interface ListScrollablePresentation extends ListPresentation {
  readonly scroll: ScrollState;
}

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
  const view = viewForListOptions(options);
  const { selectable } = view;
  if (selectable.length === 0) return withoutSelection(state);
  const selectedId = selectedIdForAction(state.selectedId, action, view, state.scroll?.viewportRows);
  if (selectedId === undefined) return state;
  const scrollIndex = listViewScrollPosition(view, selectedId);
  const scroll = state.scroll === undefined || scrollIndex === undefined
    ? state.scroll
    : scrollReducer(state.scroll, { kind: 'itemIntoView', itemIndex: scrollIndex });
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

export function visibleListEntries<TValue>(options: ListReducerOptions<TValue>): readonly ListViewEntry<TValue>[] {
  return viewForListOptions(options).entries;
}

export function prepareListCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListItemProjector<TValue>
): CompleteListCollection<TValue>;
export function prepareListCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListItemProjector<TValue>,
  window: CollectionWindow
): WindowedListCollection<TValue>;
export function prepareListCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListItemProjector<TValue>,
  window?: CollectionWindow
): ListCollection<TValue> {
  const startIndex = window?.startIndex ?? 0;
  const records = values.map((value, offset): ListCollectionRecord<TValue> => {
    const itemIndex = startIndex + offset;
    const item = normalizedListItem(projectItem(value, itemIndex));
    return { id: item.id, itemIndex, value, item };
  });
  return window === undefined
    ? completeCollection(records)
    : windowedCollection({ records, window });
}

export function prepareListProjection<TValue>(options: ListReducerOptions<TValue>): ListViewProjection<TValue> {
  return viewForListOptions(options);
}

function normalizedListItem(item: ListItemProjection): ListCollectionRecord<unknown>['item'] {
  const clean = (value: string): string => sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
  return Object.freeze({
    id: clean(item.id),
    label: clean(item.label),
    ...(item.description === undefined ? {} : { description: clean(item.description) }),
    ...(item.keywords === undefined ? {} : { keywords: Object.freeze(item.keywords.map(clean)) }),
    disabled: item.disabled === true
  });
}

function selectedIdForAction<TValue>(
  current: string | undefined,
  action: Exclude<ListAction, { readonly kind: 'scroll' | 'activate' }>,
  view: ListViewProjection<TValue>,
  viewportRows = 1
): string | undefined {
  const { selectable } = view;
  if (action.kind === 'select') return listViewSelectablePosition(view, action.id) === undefined ? current : action.id;
  if (action.kind === 'first') return selectable[0]?.item.id;
  if (action.kind === 'last') return selectable.at(-1)?.item.id;
  const delta = action.kind === 'page'
    ? action.delta * Math.max(1, viewportRows)
    : action.delta;
  const currentPosition = current === undefined ? undefined : listViewSelectablePosition(view, current);
  if (currentPosition === undefined) return delta < 0 ? selectable.at(-1)?.item.id : selectable[0]?.item.id;
  return selectable[wrapIndex(currentPosition + delta, selectable.length)]?.item.id;
}

function viewForListOptions<TValue>(options: ListReducerOptions<TValue>): ListViewProjection<TValue> {
  if (options.collection?.kind === 'window') return prepareListView(options.collection);
  const collection = options.collection ?? prepareListCollection(options.items, options.projectItem);
  return prepareListView(collection, options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery });
}

function withoutSelection(state: ListState): ListState {
  return state.selectedId === undefined ? state : state.scroll === undefined ? {} : { scroll: state.scroll };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
