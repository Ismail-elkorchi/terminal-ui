import { adjacentItemId } from '../interaction/navigation.ts';
import { collectionInteractionHas, collectionInteractionIds } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import { editTextBuffer } from '../text/index.ts';
import type { SearchEntry } from '../ui-model/contracts.ts';
import type {
  SearchPickerControlTransition,
  SearchPickerPresentation,
  SearchPickerTransition,
  ScrollableSearchPickerPresentation,
  UnscrolledSearchPickerPresentation,
} from '../ui-model/search-picker.ts';
import { querySearchPickerIndex } from '../ui-model/search-picker-index.ts';
import type { SearchPickerIndex } from '../ui-model/search-picker-index.ts';
import type { CollectionQuery } from '../ui-model/query.ts';
import { rowWindow } from './data-window.ts';
import { applyScrollEvent } from './scroll.ts';

export interface SearchPickerReducerOptions<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly navigation?: NavigationPolicy;
}

export interface SearchPickerWindowInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query?: CollectionQuery;
  readonly activeId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface SearchPickerWindow<TValue = string> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly activeIndex?: number;
  readonly activeEntry?: SearchEntry<TValue>;
  readonly totalCount: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export interface SearchPickerActiveInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly presentation: SearchPickerPresentation;
  readonly limit?: number;
}

export function searchPickerReducer<TValue>(
  state: ScrollableSearchPickerPresentation,
  transition: SearchPickerTransition,
  options: SearchPickerReducerOptions<TValue>,
): ScrollableSearchPickerPresentation;
export function searchPickerReducer<TValue>(
  state: UnscrolledSearchPickerPresentation,
  transition: SearchPickerControlTransition,
  options: SearchPickerReducerOptions<TValue>,
): UnscrolledSearchPickerPresentation;
export function searchPickerReducer<TValue>(
  state: SearchPickerPresentation,
  transition: SearchPickerTransition,
  options: SearchPickerReducerOptions<TValue>,
): SearchPickerPresentation {
  switch (transition.kind) {
    case 'setQuery':
      return activeForQuery(state, transition.query, options.searchPickerIndex);
    case 'insertQuery': {
      const query = state.query.text;
      const next = editTextBuffer(
        { text: query, cursor: query.length },
        { kind: 'insert', text: transition.text },
      );
      return activeForQuery(
        state,
        { ...state.query, text: next.text },
        options.searchPickerIndex,
      );
    }
    case 'deleteQueryBackward': {
      const query = state.query.text;
      const next = editTextBuffer(
        { text: query, cursor: query.length },
        { kind: 'deleteBackward' },
      );
      return activeForQuery(
        state,
        { ...state.query, text: next.text },
        options.searchPickerIndex,
      );
    }
    case 'setActive':
      return withActive(state, enabledIndex(state, options.searchPickerIndex), transition.id);
    case 'moveActive': {
      const enabled = enabledIndex(state, options.searchPickerIndex);
      return withActive(
        state,
        enabled,
        adjacentItemId(collectionInteractionIds(enabled), state.activeId, transition.delta, options.navigation),
      );
    }
    case 'firstActive': {
      const enabled = enabledIndex(state, options.searchPickerIndex);
      return withActive(state, enabled, collectionInteractionIds(enabled)[0]);
    }
    case 'lastActive': {
      const enabled = enabledIndex(state, options.searchPickerIndex);
      return withActive(state, enabled, collectionInteractionIds(enabled).at(-1));
    }
    case 'scroll': {
      const scroll = applyScrollEvent(state.scroll ?? transition.event.nextState, transition.event);
      return state.scroll === scroll ? state : { ...state, scroll };
    }
  }
}

export function searchPickerWindow<TValue>(
  input: SearchPickerWindowInput<TValue>,
): SearchPickerWindow<TValue> {
  const filtered = querySearchPickerIndex(
    input.searchPickerIndex,
    input.query ?? { text: '', mode: 'fuzzy' },
  ).entries;
  const totalCount = filtered.length;
  const limit = Math.max(1, Math.floor(input.limit ?? Math.max(1, totalCount)));
  if (totalCount === 0) {
    return {
      entries: [],
      totalCount: 0,
      startIndex: 0,
      endIndexExclusive: 0,
      omittedBefore: 0,
      omittedAfter: 0,
    };
  }
  const initialWindow = rowWindow(filtered, {
    viewportRows: limit,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  });
  const activeAbsolute = activeIndex(filtered, input.activeId, initialWindow);
  const window = rowWindow(filtered, {
    viewportRows: limit,
    ...(activeAbsolute === undefined ? {} : { activeIndex: activeAbsolute }),
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  });
  const activeEntry = activeAbsolute === undefined ? undefined : filtered[activeAbsolute];
  return {
    entries: window.rows,
    ...(window.activeVisibleIndex === undefined ? {} : { activeIndex: window.activeVisibleIndex }),
    ...(activeEntry === undefined ? {} : { activeEntry }),
    totalCount,
    startIndex: window.startIndex,
    endIndexExclusive: window.endIndexExclusive,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter,
  };
}

export function activeSearchPickerEntry<TValue>(
  input: SearchPickerActiveInput<TValue>,
): SearchEntry<TValue> | undefined {
  const scroll = input.presentation.scroll;
  return searchPickerWindow({
    searchPickerIndex: input.searchPickerIndex,
    query: input.presentation.query,
    ...(input.presentation.activeId === undefined ? {} : { activeId: input.presentation.activeId }),
    ...(scroll === undefined ? {} : { scroll }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  }).activeEntry;
}

function activeForQuery<TValue>(
  state: SearchPickerPresentation,
  query: CollectionQuery,
  index: SearchPickerIndex<TValue>,
): SearchPickerPresentation {
  const result = querySearchPickerIndex(index, query);
  const activeId = result.entries.find(
    (entry) => entry.disabled !== true,
  )?.id;
  if (sameQuery(state.query, result.query) && state.activeId === activeId) return state;
  return {
    query: result.query,
    ...(activeId === undefined ? {} : { activeId }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  };
}

function enabledIndex<TValue>(
  state: SearchPickerPresentation,
  index: SearchPickerIndex<TValue>,
): import('../interaction/collection.ts').CollectionInteractionIndex {
  return querySearchPickerIndex(index, state.query).interactionIndex;
}

function withActive(
  state: SearchPickerPresentation,
  enabled: import('../interaction/collection.ts').CollectionInteractionIndex,
  activeId: string | undefined,
): SearchPickerPresentation {
  const valid = activeId !== undefined && collectionInteractionHas(enabled, activeId) ? activeId : undefined;
  if (state.activeId === valid) return state;
  return {
    query: state.query,
    ...(valid === undefined ? {} : { activeId: valid }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  };
}

function activeIndex<TValue>(
  entries: readonly SearchEntry<TValue>[],
  activeId: string | undefined,
  fallbackWindow: { readonly startIndex: number; readonly endIndexExclusive: number },
): number | undefined {
  if (activeId !== undefined) {
    const byId = entries.findIndex((entry) => entry.id === activeId && entry.disabled !== true);
    if (byId >= 0) return byId;
  }
  const visible = entries.findIndex((entry, index) =>
    index >= fallbackWindow.startIndex
    && index < fallbackWindow.endIndexExclusive
    && entry.disabled !== true
  );
  if (visible >= 0) return visible;
  const first = entries.findIndex((entry) => entry.disabled !== true);
  return first < 0 ? undefined : first;
}

function sameQuery(left: CollectionQuery, right: CollectionQuery): boolean {
  return left.text === right.text
    && left.mode === right.mode
    && left.caseSensitive === right.caseSensitive;
}
