import { collectionInteractionReducer } from '../interaction/collection.ts';
import type { CollectionInteractionIndex } from '../interaction/collection.ts';
import type { SelectionPolicy } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type {
  ListViewControlTransition,
  ListViewPresentation,
  ListViewTransition,
  ScrollableListViewPresentation,
  UnscrolledListViewPresentation,
} from '../ui-model/semantic-list.ts';
import { applyScrollEvent } from './scroll.ts';

export interface ListViewReducerOptions {
  readonly index: CollectionInteractionIndex;
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
}

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
    return state.scroll === undefined
      ? state
      : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
  const interaction = collectionInteractionReducer(state, action, {
    index: options.index,
    selection: options.selection,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  return interaction === state
    ? state
    : { ...interaction, ...(state.scroll === undefined ? {} : { scroll: state.scroll }) };
}
