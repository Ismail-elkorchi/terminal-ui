import type { ListboxControlTransition, ListboxTransition } from '../ui-model/list.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxCollectionRecord,
  ListboxOption,
  ListboxOptionProjector,
  ListboxPresentation,
  ScrollableListboxPresentation,
  UnscrolledListboxPresentation,
  ListboxViewEntry,
  PreparedListboxView,
  WindowedListboxCollection
} from '../ui-model/list.ts';
import {
  listboxViewScrollPosition,
  prepareListboxView
} from '../ui-model/list-view.ts';
import { completeCollection, windowedCollection } from '../ui-model/collection.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import { collectionInteractionReducer } from '../interaction/collection.ts';
import type { SelectionPolicy } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';

export type ListboxReducerOptions<TValue> = (
  | {
      readonly items: readonly TValue[];
      readonly projectItem: ListboxOptionProjector<TValue>;
      readonly collection?: never;
      readonly filterQuery?: import('../ui-model/query.ts').CollectionQuery;
    }
  | {
      readonly collection: CompleteListboxCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly filterQuery?: import('../ui-model/query.ts').CollectionQuery;
    }
  | {
      readonly collection: WindowedListboxCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly filterQuery?: never;
    }
) & {
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
};

export function listboxReducer<TValue>(
  state: ScrollableListboxPresentation,
  action: ListboxTransition,
  options: ListboxReducerOptions<TValue>
): ScrollableListboxPresentation;
export function listboxReducer<TValue>(
  state: UnscrolledListboxPresentation,
  action: ListboxControlTransition,
  options: ListboxReducerOptions<TValue>
): UnscrolledListboxPresentation;
export function listboxReducer<TValue>(
  state: ListboxPresentation,
  action: ListboxTransition,
  options: ListboxReducerOptions<TValue>
): ListboxPresentation {
  if (action.kind === 'scroll') {
    return state.scroll === undefined
      ? state
      : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
  const view = prepareListboxViewForOptions(options);
  const interactionAction = action.kind === 'pageActive'
    ? { kind: 'moveActive' as const, delta: action.delta * Math.max(1, options.pageSize ?? 1) }
    : action;
  const interaction = collectionInteractionReducer(state, interactionAction, {
    index: view.interactionIndex,
    selection: options.selection,
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
  return prepareListboxViewForOptions(options).entries;
}

export function prepareListboxCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListboxOptionProjector<TValue>
): CompleteListboxCollection<TValue>;
export function prepareListboxCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListboxOptionProjector<TValue>,
  window: CollectionWindow
): WindowedListboxCollection<TValue>;
export function prepareListboxCollection<TValue>(
  values: readonly TValue[],
  projectItem: ListboxOptionProjector<TValue>,
  window?: CollectionWindow
): ListboxCollection<TValue> {
  const startIndex = window?.startIndex ?? 0;
  const records = values.map((value, offset): ListboxCollectionRecord<TValue> => {
    const itemIndex = startIndex + offset;
    const item = normalizedListItem(projectItem(value, itemIndex));
    return { id: item.id, itemIndex, value, item };
  });
  return window === undefined
    ? completeCollection(records)
    : windowedCollection({ records, window });
}

function normalizedListItem(item: ListboxOption): ListboxCollectionRecord<unknown>['item'] {
  const clean = (value: string): string => sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
  return Object.freeze({
    id: clean(item.id),
    label: clean(item.label),
    ...(item.description === undefined ? {} : { description: clean(item.description) }),
    ...(item.keywords === undefined ? {} : { keywords: Object.freeze(item.keywords.map(clean)) }),
    disabled: item.disabled === true
  });
}

export function prepareListboxViewForOptions<TValue>(options: ListboxReducerOptions<TValue>): PreparedListboxView<TValue> {
  if (options.collection?.kind === 'window') return prepareListboxView(options.collection);
  const collection = options.collection ?? prepareListboxCollection(options.items, options.projectItem);
  return prepareListboxView(collection, options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery });
}
