import type { ListAction } from '../components/list.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from './scroll.ts';

export interface ListState {
  readonly selected?: number;
  readonly scroll?: ScrollState;
}

export interface ListReducerOptions<TValue> {
  readonly items: readonly TValue[];
  readonly filterQuery?: string;
  readonly isDisabled?: (value: TValue, index: number) => boolean;
}

export interface ListPresentation {
  readonly selected?: number;
  readonly scroll?: ScrollState;
}

export interface ListVisibleEntry<TValue> {
  readonly value: TValue;
  readonly index: number;
  readonly disabled: boolean;
}

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
  const selectable = visible.filter((entry) => !entry.disabled);
  if (selectable.length === 0) return withoutSelection(state);
  const selected = selectedIndexForAction(state.selected, action, selectable, state.scroll?.viewportRows);
  if (selected === undefined) return state;
  const visibleIndex = visible.findIndex((entry) => entry.index === selected);
  const scroll = state.scroll === undefined || visibleIndex < 0
    ? state.scroll
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: visibleIndex });
  return state.selected === selected && state.scroll === scroll
    ? state
    : {
        selected,
        ...(scroll === undefined ? {} : { scroll })
      };
}

export function listPresentation(state: ListState): ListPresentation {
  return {
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

export function visibleListEntries<TValue>(options: ListReducerOptions<TValue>): readonly ListVisibleEntry<TValue>[] {
  const query = (options.filterQuery ?? '').trim().toLocaleLowerCase();
  return options.items.flatMap((value, index): readonly ListVisibleEntry<TValue>[] => {
    if (query.length > 0 && !String(value).toLocaleLowerCase().includes(query)) return [];
    return [{ value, index, disabled: options.isDisabled?.(value, index) === true }];
  });
}

function selectedIndexForAction<TValue>(
  current: number | undefined,
  action: Exclude<ListAction, { readonly kind: 'scroll' | 'activate' }>,
  selectable: readonly ListVisibleEntry<TValue>[],
  viewportRows = 1
): number | undefined {
  if (action.kind === 'select') return selectable.some((entry) => entry.index === action.index) ? action.index : current;
  if (action.kind === 'first') return selectable[0]?.index;
  if (action.kind === 'last') return selectable.at(-1)?.index;
  const currentPosition = Math.max(0, selectable.findIndex((entry) => entry.index === current));
  const delta = action.kind === 'page'
    ? action.delta * Math.max(1, viewportRows)
    : action.delta;
  return selectable[wrapIndex(currentPosition + delta, selectable.length)]?.index;
}

function withoutSelection(state: ListState): ListState {
  return state.selected === undefined ? state : state.scroll === undefined ? {} : { scroll: state.scroll };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
