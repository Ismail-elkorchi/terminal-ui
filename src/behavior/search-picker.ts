import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import {
  createEditablePopupInputState,
  editablePopupInputReducer,
} from '../interaction/editable-popup-input.ts';
import type { EditablePopupInputState } from '../interaction/editable-popup-input.ts';
import type { SearchEntry } from '../ui-model/contracts.ts';
import type {
  SearchPickerPresentation,
  SearchPickerTransition,
} from '../ui-model/search-picker.ts';
import { querySearchPickerIndex } from '../ui-model/search-picker-index.ts';
import type { SearchPickerIndex } from '../ui-model/search-picker-index.ts';
import type { CollectionQuery } from '../text/query.ts';
import { rowWindow } from './data-window.ts';
import { applyScrollEvent } from './scroll.ts';

export interface SearchPickerReducerOptions<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly navigation?: NavigationPolicy;
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
  const query = input.query ?? { text: '', mode: 'fuzzy' };
  const result = querySearchPickerIndex(searchPickerIndex, query);
  const activeId = result.entries.find((entry) => entry.disabled !== true)?.id;
  return {
    editor: createEditablePopupInputState({
      value: result.query.text,
      open: true,
      ...(activeId === undefined ? {} : { activeId }),
      ...(input.editHistoryPolicy === undefined ? {} : {
        editHistoryPolicy: input.editHistoryPolicy,
      }),
    }, result.interactionIndex),
    mode: result.query.mode,
    caseSensitive: result.query.caseSensitive,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  };
}

export function searchPickerPresentation(state: ScrollableSearchPickerState):
  Extract<SearchPickerPresentation, { readonly scroll: ScrollState }>;
export function searchPickerPresentation(state: UnscrolledSearchPickerState):
  Extract<SearchPickerPresentation, { readonly scroll?: never }>;
export function searchPickerPresentation(state: SearchPickerState): SearchPickerPresentation;
export function searchPickerPresentation(state: SearchPickerState): SearchPickerPresentation {
  return {
    query: searchPickerQuery(state),
    ...(state.editor.activeId === undefined ? {} : { activeId: state.editor.activeId }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  };
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
    case 'insertQuery':
      return withSearchEditor(state, { kind: 'edit', operation: { kind: 'insert', text: transition.text } }, options);
    case 'deleteQueryBackward':
      return withSearchEditor(state, { kind: 'edit', operation: { kind: 'deleteBackward' } }, options);
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

function withSearchEditor<TValue>(
  state: SearchPickerState,
  transition: Parameters<typeof editablePopupInputReducer>[1],
  options: SearchPickerReducerOptions<TValue>,
): SearchPickerState {
  const editor = editablePopupInputReducer(state.editor, transition, {
    indexForText: (text) => querySearchPickerIndex(options.searchPickerIndex, {
      text,
      mode: state.mode,
      ...(state.caseSensitive ? { caseSensitive: true } : {}),
    }).interactionIndex,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  return editor === state.editor ? state : { ...state, editor };
}

function searchPickerQuery(state: SearchPickerState): CollectionQuery {
  return {
    text: state.editor.input.text,
    mode: state.mode,
    ...(state.caseSensitive ? { caseSensitive: true } : {}),
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
