import type { ListboxControlTransition, ListboxTransition } from './listbox.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';
import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxCollectionItem,
  ListboxOption,
  ListboxOptionMapper,
  ListboxState,
  ScrollableListboxState,
  UnscrolledListboxState,
  ListboxViewEntry,
  ListboxView,
  WindowedListboxCollection
} from './listbox.ts';
import {
  listboxViewScrollPosition,
  createListboxView
} from './listbox-view.ts';
import { createCompleteCollection, createWindowedCollection } from '../collection/snapshot.ts';
import type { CollectionWindow } from '../collection/snapshot.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import { collectionInteractionReducer } from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';

export type ListboxReducerOptions<TValue> = (
  | {
      readonly items: readonly TValue[];
      readonly toOption: ListboxOptionMapper<TValue>;
      readonly collection?: never;
      readonly query?: import('../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: CompleteListboxCollection<TValue>;
      readonly items?: never;
      readonly toOption?: never;
      readonly query?: import('../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: WindowedListboxCollection<TValue>;
      readonly items?: never;
      readonly toOption?: never;
      readonly query?: never;
    }
) & {
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
};

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
  return listboxViewForOptions(options).entries;
}

export function createListboxCollection<TValue>(
  values: readonly TValue[],
  toOption: ListboxOptionMapper<TValue>
): CompleteListboxCollection<TValue>;
export function createListboxCollection<TValue>(
  values: readonly TValue[],
  toOption: ListboxOptionMapper<TValue>,
  window: CollectionWindow
): WindowedListboxCollection<TValue>;
export function createListboxCollection<TValue>(
  values: readonly TValue[],
  toOption: ListboxOptionMapper<TValue>,
  window?: CollectionWindow
): ListboxCollection<TValue> {
  const startIndex = window?.startIndex ?? 0;
  const items = values.map((value, offset): ListboxCollectionItem<TValue> => {
    const itemIndex = startIndex + offset;
    const option = ownListboxOption(toOption(value, itemIndex));
    return { id: option.id, itemIndex, value, option };
  });
  return window === undefined
    ? createCompleteCollection(items)
    : createWindowedCollection({ items, window });
}

function ownListboxOption(option: ListboxOption): ListboxCollectionItem<unknown>['option'] {
  const clean = (value: string): string => sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
  return Object.freeze({
    id: clean(option.id),
    label: clean(option.label),
    ...(option.description === undefined ? {} : { description: clean(option.description) }),
    ...(option.keywords === undefined ? {} : { keywords: Object.freeze(option.keywords.map(clean)) }),
    disabled: option.disabled === true
  });
}

export function listboxViewForOptions<TValue>(options: ListboxReducerOptions<TValue>): ListboxView<TValue> {
  if (options.collection?.kind === 'window') return createListboxView(options.collection);
  const collection = options.collection ?? createListboxCollection(options.items, options.toOption);
  return createListboxView(collection, options.query === undefined ? {} : { query: options.query });
}
