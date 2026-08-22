import { collectionInteractionReducer } from '../interaction/collection.ts';
import type { CollectionInteractionIndex } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type {
  ListViewControlTransition,
  ListViewPresentation,
  ListViewTransition,
  ScrollableListViewPresentation,
  UnscrolledListViewPresentation,
} from '../ui-model/semantic-list.ts';
import { applyScrollEvent } from './scroll.ts';
import { measuredWindow } from './measured-window.ts';
import type { MeasuredCollection } from '../ui-model/measured-collection.ts';

/** @beta */
export interface ListViewReducerOptions<TValue = unknown> {
  readonly index: CollectionInteractionIndex;
  readonly collection: MeasuredCollection<TValue>;
  readonly viewportRows: number;
  readonly navigation?: NavigationPolicy;
}

/** @beta */
export function listViewReducer(
  state: ScrollableListViewPresentation,
  action: ListViewTransition,
  options: ListViewReducerOptions,
): ScrollableListViewPresentation;
export function listViewReducer(
  state: UnscrolledListViewPresentation,
  action: ListViewControlTransition,
  options: ListViewReducerOptions,
): UnscrolledListViewPresentation;
export function listViewReducer(
  state: ListViewPresentation,
  action: ListViewTransition,
  options: ListViewReducerOptions,
): ListViewPresentation {
  if (action.kind === 'scroll') {
    if (state.scroll === undefined) return state;
    const scroll = applyScrollEvent(state.scroll, action.event);
    return scroll === state.scroll ? state : { ...state, scroll };
  }
  const interaction = collectionInteractionReducer(state, action, {
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
