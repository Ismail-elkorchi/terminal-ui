import { editTextBuffer } from '../text/index.ts';
import { rowWindow } from './data-window.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { SearchEntry } from '../ui-model/contracts.ts';
import type { SearchPickerAction } from '../ui-model/search-picker.ts';
import { querySearchPickerIndex } from '../ui-model/search-picker-index.ts';
import type { SearchPickerIndex } from '../ui-model/search-picker-index.ts';

export interface SearchPickerState {
  readonly query: string;
  readonly selectedIndex: number;
}

export interface SearchPickerReducerOptions<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
}

export interface SearchPickerWindowInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query?: string;
  readonly selectedIndex?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface SearchPickerWindow<TValue = string> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly selectedIndex?: number;
  readonly selectedEntry?: SearchEntry<TValue>;
  readonly totalCount: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export interface SearchPickerSelectionInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly state: SearchPickerState;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export function searchPickerReducer<TValue>(
  state: SearchPickerState,
  action: SearchPickerAction,
  options: SearchPickerReducerOptions<TValue>
): SearchPickerState {
  switch (action.kind) {
    case 'setQuery':
      return {
        ...state,
        query: action.query,
        selectedIndex: 0
      };
    case 'insertQuery': {
      const next = editTextBuffer({ text: state.query, cursor: state.query.length }, { kind: 'insert', text: action.text });
      return {
        ...state,
        query: next.text,
        selectedIndex: 0
      };
    }
    case 'deleteQueryBackward': {
      const next = editTextBuffer({ text: state.query, cursor: state.query.length }, { kind: 'deleteBackward' });
      return {
        ...state,
        query: next.text,
        selectedIndex: 0
      };
    }
    case 'moveSelection':
      return {
        ...state,
        selectedIndex: wrapIndex(
          state.selectedIndex + action.delta,
          querySearchPickerIndex(options.searchPickerIndex, state.query).entries.length
        )
      };
  }
}

export function searchPickerWindow<TValue>(input: SearchPickerWindowInput<TValue>): SearchPickerWindow<TValue> {
  const result = querySearchPickerIndex(input.searchPickerIndex, input.query ?? '');
  const filtered = result.entries;
  const totalCount = filtered.length;
  const limit = Math.max(1, Math.floor(input.limit ?? totalCount));
  if (totalCount === 0) {
    return {
      entries: [],
      totalCount,
      startIndex: 0,
      endIndexExclusive: 0,
      omittedBefore: 0,
      omittedAfter: 0
    };
  }
  const selectedAbsolute = selectedIndex(filtered, input);
  const window = rowWindow(filtered, {
    viewportRows: limit,
    selectedIndex: selectedAbsolute,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll })
  });
  return {
    entries: window.rows,
    ...(window.selectedVisibleIndex === undefined ? {} : { selectedIndex: window.selectedVisibleIndex }),
    ...(filtered[selectedAbsolute] === undefined ? {} : { selectedEntry: filtered[selectedAbsolute] }),
    totalCount,
    startIndex: window.startIndex,
    endIndexExclusive: window.endIndexExclusive,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter
  };
}

export function selectedSearchPickerEntry<TValue>(input: SearchPickerSelectionInput<TValue>): SearchEntry<TValue> | undefined {
  return searchPickerWindow({
    searchPickerIndex: input.searchPickerIndex,
    query: input.state.query,
    selectedIndex: input.state.selectedIndex,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
    ...(input.limit === undefined ? {} : { limit: input.limit })
  }).selectedEntry;
}

function wrapIndex(index: number, count: number): number {
  const size = Math.max(0, Math.floor(count));
  if (size === 0) return 0;
  return ((Math.floor(index) % size) + size) % size;
}

function clampIndex(index: number, count: number): number {
  const size = Math.max(0, Math.floor(count));
  if (size === 0) return 0;
  return Math.max(0, Math.min(size - 1, Math.floor(index)));
}

function selectedIndex<TValue>(
  entries: readonly SearchEntry<TValue>[],
  input: Pick<SearchPickerWindowInput<TValue>, 'selectedIndex' | 'selectedId'>
): number {
  if (input.selectedId !== undefined) {
    const byId = entries.findIndex((entry) => entry.id === input.selectedId);
    if (byId !== -1) return byId;
  }
  return clampIndex(input.selectedIndex ?? 0, entries.length);
}
