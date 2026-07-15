import type { ListAction, ListControlAction } from '../ui-model/list.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { ListItemProjection, ListItemProjector } from '../ui-model/list.ts';

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

export interface ListReducerOptions<TValue> {
  readonly items: readonly TValue[];
  readonly projectItem: ListItemProjector<TValue>;
  readonly filterQuery?: string;
}

export interface ListPresentation {
  readonly selectedId?: string;
}

export interface ListScrollablePresentation extends ListPresentation {
  readonly scroll: ScrollState;
}

export interface ListVisibleEntry<TValue> {
  readonly value: TValue;
  readonly item: ListItemProjection;
  readonly index: number;
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
  const visible = visibleListEntries(options);
  const selectable = visible.filter((entry) => entry.item.disabled !== true);
  if (selectable.length === 0) return withoutSelection(state);
  const selectedId = selectedIdForAction(state.selectedId, action, selectable, state.scroll?.viewportRows);
  if (selectedId === undefined) return state;
  const visibleIndex = visible.findIndex((entry) => entry.item.id === selectedId);
  const scroll = state.scroll === undefined || visibleIndex < 0
    ? state.scroll
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: visibleIndex });
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
  const query = (options.filterQuery ?? '').trim().toLocaleLowerCase();
  const projected = projectListItems(options.items, options.projectItem);
  return projected.flatMap(({ value, item, index }): readonly ListVisibleEntry<TValue>[] =>
    query.length > 0 && !listItemSearchText(item).includes(query) ? [] : [{ value, item, index }]
  );
}

export function projectListItems<TValue>(
  values: readonly TValue[],
  projectItem: ListItemProjector<TValue>
): readonly ListVisibleEntry<TValue>[] {
  const ids = new Set<string>();
  return values.map((value, index) => {
    const item = projectItem(value, index);
    if (item.id.length === 0) throw new Error('list ids must not be empty');
    if (ids.has(item.id)) throw new Error('list ids must be unique');
    ids.add(item.id);
    return { value, item, index };
  });
}

function selectedIdForAction<TValue>(
  current: string | undefined,
  action: Exclude<ListAction, { readonly kind: 'scroll' | 'activate' }>,
  selectable: readonly ListVisibleEntry<TValue>[],
  viewportRows = 1
): string | undefined {
  if (action.kind === 'select') return selectable.some((entry) => entry.item.id === action.id) ? action.id : current;
  if (action.kind === 'first') return selectable[0]?.item.id;
  if (action.kind === 'last') return selectable.at(-1)?.item.id;
  const delta = action.kind === 'page'
    ? action.delta * Math.max(1, viewportRows)
    : action.delta;
  const currentPosition = selectable.findIndex((entry) => entry.item.id === current);
  if (currentPosition < 0) return delta < 0 ? selectable.at(-1)?.item.id : selectable[0]?.item.id;
  return selectable[wrapIndex(currentPosition + delta, selectable.length)]?.item.id;
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
