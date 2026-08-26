import { collectionInteractionReducer } from '../interaction/collection-interaction.ts';
import type { CollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { CollectionInteractionTransition, CollectionInteractionState } from '../interaction/collection-interaction.ts';
import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import { applyScrollRequest } from './scroll.ts';
import { measuredWindow } from '../collection/measured-window-operations.ts';
import type { MeasuredCollection } from '../collection/measured-collection.ts';

/** @beta */
export interface UnscrolledListViewState extends CollectionInteractionState {
  readonly scroll?: never;
}

/** @beta */
export interface ScrollableListViewState extends CollectionInteractionState {
  readonly scroll: ScrollState;
}

/** @beta */
export type ListViewState = UnscrolledListViewState | ScrollableListViewState;

/** @beta */
export type ListViewTransition = CollectionInteractionTransition | {
  readonly kind: 'scroll';
  readonly request: ScrollRequest;
};

/** @beta */
export type ListViewControlTransition = Exclude<ListViewTransition, { readonly kind: 'scroll' }>;

/** @beta */
export interface ListViewActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
  readonly itemIndex: number;
}

/** @beta */
export interface ListViewReducerOptions<TValue = unknown> {
  readonly index: CollectionInteractionIndex;
  readonly collection: MeasuredCollection<TValue>;
  readonly viewportRows: number;
  readonly navigation?: NavigationPolicy;
}

/** @beta */
export function listViewReducer(
  state: ScrollableListViewState,
  transition: ListViewTransition,
  options: ListViewReducerOptions,
): ScrollableListViewState;
export function listViewReducer(
  state: UnscrolledListViewState,
  transition: ListViewControlTransition,
  options: ListViewReducerOptions,
): UnscrolledListViewState;
export function listViewReducer(
  state: ListViewState,
  transition: ListViewTransition,
  options: ListViewReducerOptions,
): ListViewState {
  if (transition.kind === 'scroll') {
    if (state.scroll === undefined) return state;
    const scroll = applyScrollRequest(state.scroll, transition.request);
    return scroll === state.scroll ? state : { ...state, scroll };
  }
  const interaction = collectionInteractionReducer(state, transition, {
    index: options.index,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  if (interaction === state) return state;
  if (state.scroll === undefined || interaction.activeId === undefined) return interaction;
  const offsetRow = measuredWindow(options.collection, {
    viewportRows: options.viewportRows,
    offsetRow: state.scroll.offsetRow,
    activeId: interaction.activeId,
  }).offsetRow;
  return {
    ...interaction,
    scroll: {
      ...state.scroll,
      offsetRow,
      ...(offsetRow === state.scroll.offsetRow ? {} : { followTail: false }),
    },
  };
}
