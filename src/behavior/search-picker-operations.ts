import type { SearchEntry } from '../collection/item.ts';
import type { EditablePopupInputState } from '../interaction/editable-popup-input.ts';
import {
  createEditablePopupInputState,
  editablePopupInputReducer,
} from '../interaction/editable-popup-input.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import { compileCollectionQuery, type CollectionQuery } from '../text/query.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';
import { collectionInteractionIds, createCollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { SearchPickerIndex, SearchPickerQueryResult } from './search-picker-index.ts';
import { matchingSearchPickerQuery, querySearchPickerIndex, searchPickerQueryPosition } from './search-picker-index.ts';
import type { SearchPickerTransition, SearchPickerView } from './search-picker.ts';
import { sliceVisibleRows } from './visible-row-window.ts';

export interface SearchPickerReducerOptions<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  /** Omit for synchronous queries; null means pending, mismatched results remain pending. */
  readonly queryResult?: SearchPickerQueryResult<TValue> | null;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

interface SearchPickerStateBase {
  readonly editor: EditablePopupInputState;
  readonly mode: NonNullable<CollectionQuery['mode']>;
  readonly caseSensitive: boolean;
}

export interface UnscrolledSearchPickerState extends SearchPickerStateBase {
  readonly scroll?: never;
}

export interface ScrollableSearchPickerState extends SearchPickerStateBase {
  readonly scroll: ScrollState;
}

export type SearchPickerState =
  | UnscrolledSearchPickerState
  | ScrollableSearchPickerState;

export interface CreateSearchPickerStateInput {
  readonly query?: CollectionQuery;
  readonly queryResult?: SearchPickerQueryResult<unknown> | null;
  readonly scroll?: ScrollState;
  readonly editHistoryPolicy?: import('../text/index.ts').EditHistoryPolicy;
}

export function createSearchPickerState<TValue>(
  input: CreateSearchPickerStateInput & { readonly scroll: ScrollState },
  searchPickerIndex: SearchPickerIndex<TValue>,
): ScrollableSearchPickerState;
export function createSearchPickerState<TValue>(
  input: CreateSearchPickerStateInput & { readonly scroll?: never },
  searchPickerIndex: SearchPickerIndex<TValue>,
): UnscrolledSearchPickerState;
export function createSearchPickerState<TValue>(
  input: CreateSearchPickerStateInput,
  searchPickerIndex: SearchPickerIndex<TValue>,
): SearchPickerState;
export function createSearchPickerState<TValue>(
  input: CreateSearchPickerStateInput,
  searchPickerIndex: SearchPickerIndex<TValue>,
): SearchPickerState {
  const query = compileCollectionQuery(input.query ?? { text: '', mode: 'fuzzy' });
  const result = input.queryResult === undefined ? querySearchPickerIndex(searchPickerIndex, query)
    : matchingSearchPickerQuery(searchPickerIndex, query, input.queryResult);
  const activeId = result === undefined ? undefined : collectionInteractionIds(result.interactionIndex)[0];
  return {
    editor: createEditablePopupInputState({
      value: query.text,
      open: true,
      ...(activeId === undefined ? {} : { activeId }),
      ...(input.editHistoryPolicy === undefined ? {} : {
        editHistoryPolicy: input.editHistoryPolicy,
      }),
    }, result?.interactionIndex ?? emptySearchInteraction),
    mode: query.mode,
    caseSensitive: query.caseSensitive,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  };
}

export function searchPickerView(state: ScrollableSearchPickerState):
  Extract<SearchPickerView, { readonly scroll: ScrollState }>;
export function searchPickerView(state: UnscrolledSearchPickerState):
  Extract<SearchPickerView, { readonly scroll?: never }>;
export function searchPickerView(state: SearchPickerState): SearchPickerView;
export function searchPickerView(state: SearchPickerState): SearchPickerView {
  return {
    input: state.editor.input,
    query: {
      mode: state.mode,
      ...(state.caseSensitive ? { caseSensitive: true } : {}),
    },
    ...(state.editor.activeId === undefined ? {} : { activeId: state.editor.activeId }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  };
}

export interface SearchPickerWindowInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  /** Omit for synchronous queries; null means pending, mismatched results remain pending. */
  readonly queryResult?: SearchPickerQueryResult<TValue> | null;
  readonly query?: CollectionQuery;
  readonly activeId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface SearchPickerWindow<TValue = string> {
  readonly matches: readonly import('../text/query.ts').QueryMatch[];
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
  /** Omit for synchronous queries; null means pending, mismatched results remain pending. */
  readonly queryResult?: SearchPickerQueryResult<TValue> | null;
  readonly view: SearchPickerView;
  readonly limit?: number;
}

export function searchPickerReducer<TValue>(
  state: ScrollableSearchPickerState,
  transition: SearchPickerTransition,
  options: SearchPickerReducerOptions<TValue>,
): ScrollableSearchPickerState;
export function searchPickerReducer<TValue>(
  state: UnscrolledSearchPickerState,
  transition: Exclude<SearchPickerTransition, { readonly kind: 'scroll' }>,
  options: SearchPickerReducerOptions<TValue>,
): UnscrolledSearchPickerState;
export function searchPickerReducer<TValue>(
  state: SearchPickerState,
  transition: SearchPickerTransition,
  options: SearchPickerReducerOptions<TValue>,
): SearchPickerState;
export function searchPickerReducer<TValue>(
  state: SearchPickerState,
  transition: SearchPickerTransition,
  options: SearchPickerReducerOptions<TValue>,
): SearchPickerState {
  switch (transition.kind) {
    case 'setQuery': {
      const next = {
        ...state,
        mode: transition.query.mode ?? 'fuzzy',
        caseSensitive: transition.query.caseSensitive ?? false,
      };
      return withSearchEditor(next, { kind: 'setText', value: transition.query.text }, options);
    }
    case 'edit':
    case 'pointer':
      return withSearchEditor(state, transition, options);
    case 'undo':
    case 'redo':
      return withSearchEditor(state, transition, options);
    case 'setActive':
      return withSearchEditor(state, { kind: 'setActive', ...(transition.id === undefined ? {} : { id: transition.id }) }, options);
    case 'moveActive':
      return withSearchEditor(state, { kind: 'moveActive', delta: transition.delta }, options);
    case 'firstActive':
      return withSearchEditor(state, { kind: 'firstActive' }, options);
    case 'lastActive':
      return withSearchEditor(state, { kind: 'lastActive' }, options);
    case 'scroll': {
      const scroll = applyScrollRequest(state.scroll ?? transition.request.nextState, transition.request);
      return state.scroll === scroll ? state : { ...state, scroll };
    }
  }
}

export function searchPickerWindow<TValue>(
  input: SearchPickerWindowInput<TValue>,
): SearchPickerWindow<TValue> {
  const query = input.query ?? { text: '', mode: 'fuzzy' };
  const result = input.queryResult === undefined ? querySearchPickerIndex(input.searchPickerIndex, query)
    : matchingSearchPickerQuery(input.searchPickerIndex, query, input.queryResult);
  const filtered = result?.entries ?? [];
  const totalCount = filtered.length;
  const limit = Math.max(1, Math.floor(input.limit ?? Math.max(1, totalCount)));
  if (totalCount === 0) {
    return {
      entries: [],
      matches: [],
      totalCount: 0,
      startIndex: 0,
      endIndexExclusive: 0,
      omittedBefore: 0,
      omittedAfter: 0,
    };
  }
  const initialWindow = sliceVisibleRows(filtered, {
    viewportRows: limit,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  });
  const activeAbsolute = result === undefined ? undefined : activeIndex(result, input.activeId, initialWindow);
  const window = sliceVisibleRows(filtered, {
    viewportRows: limit,
    ...(activeAbsolute === undefined ? {} : { activeIndex: activeAbsolute }),
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  });
  const activeEntry = activeAbsolute === undefined ? undefined : filtered[activeAbsolute];
  return {
    entries: window.rows,
    matches: result?.matches.slice(window.startIndex, window.endIndexExclusive) ?? [],
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
  const scroll = input.view.scroll;
  return searchPickerWindow({
    searchPickerIndex: input.searchPickerIndex,
    ...(input.queryResult === undefined ? {} : { queryResult: input.queryResult }),
    query: {
      text: input.view.input.text,
      ...input.view.query,
    },
    ...(input.view.activeId === undefined ? {} : { activeId: input.view.activeId }),
    ...(scroll === undefined ? {} : { scroll }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  }).activeEntry;
}

function withSearchEditor<TValue>(
  state: SearchPickerState,
  transition: Parameters<typeof editablePopupInputReducer>[1],
  options: SearchPickerReducerOptions<TValue>,
): SearchPickerState {
  const editor = editablePopupInputReducer(state.editor, transition, {
    indexForText: (text) => {
      const query = { text, mode: state.mode, caseSensitive: state.caseSensitive };
      const result = options.queryResult === undefined ? querySearchPickerIndex(options.searchPickerIndex, query)
        : matchingSearchPickerQuery(options.searchPickerIndex, query, options.queryResult);
      return result?.interactionIndex ?? emptySearchInteraction;
    },
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  if (editor === state.editor) return state;
  if (state.scroll === undefined || editor.activeId === undefined) return { ...state, editor };
  const query = { text: editor.input.text, mode: state.mode, caseSensitive: state.caseSensitive };
  const result = options.queryResult === undefined ? querySearchPickerIndex(options.searchPickerIndex, query)
    : matchingSearchPickerQuery(options.searchPickerIndex, query, options.queryResult);
  const entries = result?.entries ?? [];
  const itemIndex = result === undefined ? undefined : searchPickerQueryPosition(result, editor.activeId);
  if (itemIndex === undefined) return { ...state, editor };
  return {
    ...state,
    editor,
    scroll: scrollReducer(state.scroll, {
      kind: 'itemIntoView',
      itemIndex,
      alignment: 'nearest',
    }, {
      contentRows: entries.length,
      contentColumns: 0,
      viewportRows: Math.max(1, options.pageSize ?? 8),
      viewportColumns: 0,
    }),
  };
}

function activeIndex<TValue>(
  result: SearchPickerQueryResult<TValue>,
  activeId: string | undefined,
  fallbackWindow: { readonly startIndex: number; readonly endIndexExclusive: number },
): number | undefined {
  if (activeId !== undefined) {
    const position = searchPickerQueryPosition(result, activeId);
    if (position !== undefined && result.entries[position]?.disabled !== true) return position;
  }
  for (let position = fallbackWindow.startIndex; position < fallbackWindow.endIndexExclusive; position += 1) {
    if (result.entries[position]?.disabled !== true) return position;
  }
  const first = collectionInteractionIds(result.interactionIndex)[0];
  return first === undefined ? undefined : searchPickerQueryPosition(result, first);
}

const emptySearchInteraction = createCollectionInteractionIndex([]);
