import { collectionInteractionReducer } from '../interaction/collection.ts';
import type { CollectionInteractionState, SelectionPolicy } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { ListViewItem, ListViewTransition } from '../ui-model/semantic-list.ts';
import { applyScrollEvent } from './scroll.ts';

export interface ListViewState extends CollectionInteractionState {
  readonly scroll?: ScrollState;
}

export interface ListViewReducerOptions {
  readonly items: readonly Pick<ListViewItem, 'id' | 'disabled'>[];
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
}

export function listViewReducer(
  state: ListViewState,
  action: ListViewTransition,
  options: ListViewReducerOptions,
): ListViewState {
  if (action.kind === 'scroll') {
    return state.scroll === undefined
      ? state
      : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
  const interaction = collectionInteractionReducer(state, action, {
    enabledIds: options.items.filter((item) => item.disabled !== true).map((item) => item.id),
    selection: options.selection,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  return interaction === state
    ? state
    : { ...interaction, ...(state.scroll === undefined ? {} : { scroll: state.scroll }) };
}
