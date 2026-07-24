import { editTextBuffer } from '../text/index.ts';
import { rowWindow } from './data-window.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { SearchEntry } from '../ui-model/contracts.ts';
import type { SearchPickerAction } from '../ui-model/search-picker.ts';
import { projectSearchPickerQuery } from '../ui-model/search-picker-index.ts';
import type { SearchPickerIndex, SearchPickerQueryProjection } from '../ui-model/search-picker-index.ts';

export type SearchPickerAsyncState<TValue = string> =
  | { readonly status: 'idle'; readonly entries: readonly SearchEntry<TValue>[] }
  | { readonly status: 'loading'; readonly entries: readonly SearchEntry<TValue>[] }
  | { readonly status: 'error'; readonly entries: readonly SearchEntry<TValue>[]; readonly message: string };

export interface SearchPickerState {
  readonly query: string;
  readonly selectedIndex: number;
  readonly selectedIds: readonly string[];
  readonly previewId?: string;
}

export interface SearchPickerPresentation {
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

export interface SearchPickerFilterResult<TValue = string> {
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

export interface SearchPickerGroup<TValue = string> {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly SearchEntry<TValue>[];
}

export type SearchPickerGroupSelector<TValue> = (entry: SearchEntry<TValue>) => {
  readonly id: string;
  readonly label?: string;
};

export function searchPickerPresentation(state: SearchPickerState): SearchPickerPresentation {
  return {
    query: state.query,
    selectedIndex: state.selectedIndex
  };
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
          projectSearchPickerQuery(options.searchPickerIndex, state.query).entries.length
        )
      };
    case 'selectIndex':
      return {
        ...state,
        selectedIndex: clampIndex(
          action.entryIndex,
          projectSearchPickerQuery(options.searchPickerIndex, state.query).entries.length
        )
      };
    case 'toggleSelected':
      return {
        ...state,
        selectedIds: toggleId(state.selectedIds, action.id)
      };
    case 'clearSelected':
      return {
        ...state,
        selectedIds: []
      };
    case 'preview':
      return action.id === undefined ? withoutPreview(state) : { ...state, previewId: action.id };
  }
}

export function searchPickerWindow<TValue>(input: SearchPickerWindowInput<TValue>): SearchPickerFilterResult<TValue> {
  const projection = projectSearchPickerQuery(input.searchPickerIndex, input.query ?? '');
  const filtered = projection.entries;
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

export function groupSearchPickerEntries<TValue>(
  entries: readonly SearchEntry<TValue>[],
  groupFor: SearchPickerGroupSelector<TValue>
): readonly SearchPickerGroup<TValue>[] {
  const groups = new Map<string, { label: string; entries: SearchEntry<TValue>[] }>();
  for (const entry of entries) {
    const group = groupFor(entry);
    const current = groups.get(group.id);
    if (current === undefined) {
      groups.set(group.id, { label: group.label ?? group.id, entries: [entry] });
    } else {
      current.entries.push(entry);
    }
  }
  return [...groups.entries()].map(([id, group]) => ({
    id,
    label: group.label,
    entries: group.entries
  }));
}

export function searchPickerStatus<TValue>(
  state: SearchPickerAsyncState<TValue>
): 'idle' | 'loading' | 'error' | 'empty' {
  if (state.status === 'loading' || state.status === 'error') return state.status;
  return state.entries.length === 0 ? 'empty' : 'idle';
}

function toggleId(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
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

export function searchPickerProjection<TValue>(index: SearchPickerIndex<TValue>, query = ''): SearchPickerQueryProjection<TValue> {
  return projectSearchPickerQuery(index, query);
}

function withoutPreview(state: SearchPickerState): SearchPickerState {
  return {
    query: state.query,
    selectedIndex: state.selectedIndex,
    selectedIds: state.selectedIds
  };
}
