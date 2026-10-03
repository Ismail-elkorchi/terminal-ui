import { collectionInteractionReducer } from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import { matchingListboxView, listboxViewScrollPosition } from './listbox-view.ts';
import type {
  ListboxControlTransition,
  ListboxState,
  ListboxTransition,
  ListboxView,
  ListboxViewEntry,
  ScrollableListboxState,
  UnscrolledListboxState,
} from './listbox.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';

export type ListboxReducerOptions<TValue> = (
  | { readonly collection: import('./listbox.ts').CompleteListboxCollection<TValue>; readonly query?: import('../text/query.ts').CollectionQuery }
  | { readonly collection: import('./listbox.ts').WindowedListboxCollection<TValue>; readonly query?: never }
) & {
  readonly view: ListboxView<TValue> | null;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

export function listboxReducer<TValue>(
  state: ScrollableListboxState,
  transition: ListboxTransition,
  options: ListboxReducerOptions<TValue>
): ScrollableListboxState;
export function listboxReducer<TValue>(
  state: UnscrolledListboxState,
  transition: ListboxControlTransition,
  options: ListboxReducerOptions<TValue>
): UnscrolledListboxState;
export function listboxReducer<TValue>(
  state: ListboxState,
  transition: ListboxTransition,
  options: ListboxReducerOptions<TValue>
): ListboxState {
  if (transition.kind === 'scroll') {
    if (state.scroll === undefined) return state;
    const scroll = applyScrollRequest(state.scroll, transition.request);
    return scroll === state.scroll ? state : { ...state, scroll };
  }
  const view = listboxViewForOptions(options);
  if (view === undefined) return state;
  const interactionTransition = transition.kind === 'pageActive'
    ? { kind: 'moveActive' as const, delta: transition.delta * Math.max(1, options.pageSize ?? 1) }
    : transition;
  const interaction = collectionInteractionReducer(state, interactionTransition, {
    index: view.interactionIndex,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  const scrollIndex = interaction.activeId === undefined
    ? undefined
    : listboxViewScrollPosition(view, interaction.activeId);
  const scroll = state.scroll === undefined || scrollIndex === undefined
    ? state.scroll
    : scrollReducer(state.scroll, {
      kind: 'itemIntoView',
      itemIndex: scrollIndex,
      alignment: 'nearest',
    }, {
      contentRows: view.totalCount,
      contentColumns: 0,
      viewportRows: Math.max(1, options.pageSize ?? 1),
      viewportColumns: 0,
    });
  return interaction === state && state.scroll === scroll
    ? state
    : {
        ...interaction,
        ...(scroll === undefined ? {} : { scroll })
      };
}

export function visibleListboxEntries<TValue>(options: ListboxReducerOptions<TValue>): readonly ListboxViewEntry<TValue>[] {
  const view = listboxViewForOptions(options);
  return view?.window(0, view.count) ?? [];
}

export { createListboxCollection, prepareListboxCollection, updateListboxCollection, prepareListboxCollectionUpdate } from './listbox-source.ts';

export function listboxViewForOptions<TValue>(options: ListboxReducerOptions<TValue>): ListboxView<TValue> | undefined {
  return matchingListboxView(options.collection, options.query, options.view);
}
