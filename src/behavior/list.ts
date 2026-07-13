import type { ListAction } from '../ui-model/list.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';

export interface ListState {
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
}

export interface ListReducerOptions<TValue> {
  readonly items: readonly TValue[];
  readonly getItemId: (value: TValue, index: number) => string;
  readonly filterQuery?: string;
  readonly isDisabled?: (value: TValue, index: number) => boolean;
}

export interface ListPresentation {
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
}

export interface ListVisibleEntry<TValue> {
  readonly value: TValue;
  readonly id: string;
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
  const selectedId = selectedIdForAction(state.selectedId, action, selectable, state.scroll?.viewportRows);
  if (selectedId === undefined) return state;
  const visibleIndex = visible.findIndex((entry) => entry.id === selectedId);
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

export function listPresentation(state: ListState): ListPresentation {
  return {
    ...(state.selectedId === undefined ? {} : { selectedId: state.selectedId }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

export function visibleListEntries<TValue>(options: ListReducerOptions<TValue>): readonly ListVisibleEntry<TValue>[] {
  const query = (options.filterQuery ?? '').trim().toLocaleLowerCase();
  return options.items.flatMap((value, index): readonly ListVisibleEntry<TValue>[] => {
    if (query.length > 0 && !String(value).toLocaleLowerCase().includes(query)) return [];
    return [{ value, id: options.getItemId(value, index), index, disabled: options.isDisabled?.(value, index) === true }];
  });
}

function selectedIdForAction<TValue>(
  current: string | undefined,
  action: Exclude<ListAction, { readonly kind: 'scroll' | 'activate' }>,
  selectable: readonly ListVisibleEntry<TValue>[],
  viewportRows = 1
): string | undefined {
  if (action.kind === 'select') return selectable.some((entry) => entry.id === action.id) ? action.id : current;
  if (action.kind === 'first') return selectable[0]?.id;
  if (action.kind === 'last') return selectable.at(-1)?.id;
  const delta = action.kind === 'page'
    ? action.delta * Math.max(1, viewportRows)
    : action.delta;
  const currentPosition = selectable.findIndex((entry) => entry.id === current);
  if (currentPosition < 0) return delta < 0 ? selectable.at(-1)?.id : selectable[0]?.id;
  return selectable[wrapIndex(currentPosition + delta, selectable.length)]?.id;
}

function withoutSelection(state: ListState): ListState {
  return state.selectedId === undefined ? state : state.scroll === undefined ? {} : { scroll: state.scroll };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
