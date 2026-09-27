import type { CollectionWindow } from '../collection/snapshot.ts';
import {
  createCompleteCollection,
  createWindowedCollection,
  isCollectionSnapshot,
} from '../collection/snapshot.ts';
import { collectionInteractionReducer } from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import { sanitizeTerminalText } from '../text/sanitize.ts';
import { createListboxView, listboxViewScrollPosition } from './listbox-view.ts';
import type {
  CompleteListboxCollection,
  ListboxCollection,
  ListboxCollectionItem,
  ListboxControlTransition,
  ListboxOptionMapper,
  ListboxState,
  ListboxTransition,
  ListboxView,
  ListboxViewEntry,
  ScrollableListboxState,
  UnscrolledListboxState,
  WindowedListboxCollection,
} from './listbox.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';

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

function ownListboxOption(option: unknown): ListboxCollectionItem<unknown>['option'] {
  if (option === null || typeof option !== 'object' || Array.isArray(option)) {
    throw new TypeError('Listbox option must be an object.');
  }
  const candidate = option as Record<string, unknown>;
  const clean = (value: unknown, field: string): string => {
    if (typeof value !== 'string') throw new TypeError(`Listbox option ${field} must be a string.`);
    return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
  };
  const id = clean(candidate['id'], 'id');
  if (id.trim().length === 0) throw new TypeError('Listbox option id must be non-empty.');
  const label = clean(candidate['label'], 'label');
  const description = candidate['description'] === undefined
    ? undefined
    : clean(candidate['description'], 'description');
  const keywords = candidate['keywords'] === undefined
    ? undefined
    : Array.isArray(candidate['keywords'])
      ? Object.freeze(candidate['keywords'].map((keyword) => clean(keyword, 'keyword')))
      : undefined;
  if (candidate['keywords'] !== undefined && keywords === undefined) {
    throw new TypeError('Listbox option keywords must be an array of strings.');
  }
  if (candidate['disabled'] !== undefined && typeof candidate['disabled'] !== 'boolean') {
    throw new TypeError('Listbox option disabled must be a boolean.');
  }
  return Object.freeze({
    id,
    label,
    ...(description === undefined ? {} : { description }),
    ...(keywords === undefined ? {} : { keywords }),
    disabled: candidate['disabled'] === true
  });
}

export function listboxViewForOptions<TValue>(options: ListboxReducerOptions<TValue>): ListboxView<TValue> {
  const supplied = options as unknown as Record<string, unknown>;
  const candidateCollection = supplied['collection'];
  const hasCollection = candidateCollection !== undefined;
  const hasItems = supplied['items'] !== undefined || supplied['toOption'] !== undefined;
  if (hasCollection === hasItems) {
    throw new TypeError('listbox requires either items with toOption, or collection.');
  }
  if (hasCollection && !isCollectionSnapshot(candidateCollection)) {
    throw new TypeError('listbox collection must be created with createListboxCollection().');
  }
  if (!hasCollection && (!Array.isArray(supplied['items']) || typeof supplied['toOption'] !== 'function')) {
    throw new TypeError('listbox requires items and toOption together.');
  }
  if (options.collection?.kind === 'window') return createListboxView(options.collection);
  const collection = options.collection ?? createListboxCollection(options.items, options.toOption);
  return createListboxView(collection, options.query === undefined ? {} : { query: options.query });
}
