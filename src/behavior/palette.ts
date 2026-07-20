import { editTextBuffer } from '../text/index.ts';
import { rowWindow } from './data-window.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { SearchEntry } from '../ui-model/contracts.ts';
import type { PaletteAction } from '../ui-model/palette.ts';
import { projectPaletteQuery } from '../ui-model/palette-index.ts';
import type { PaletteIndex, PaletteQueryProjection } from '../ui-model/palette-index.ts';

export type PaletteAsyncState<TValue = string> =
  | { readonly status: 'idle'; readonly entries: readonly SearchEntry<TValue>[] }
  | { readonly status: 'loading'; readonly entries: readonly SearchEntry<TValue>[] }
  | { readonly status: 'error'; readonly entries: readonly SearchEntry<TValue>[]; readonly message: string };

export interface PaletteState {
  readonly query: string;
  readonly selectedIndex: number;
  readonly selectedIds: readonly string[];
  readonly previewId?: string;
}

export interface PalettePresentation {
  readonly query: string;
  readonly selected: number;
}

export interface PaletteReducerOptions<TValue = string> {
  readonly index: PaletteIndex<TValue>;
}

export interface PaletteWindowInput<TValue = string> {
  readonly index: PaletteIndex<TValue>;
  readonly query?: string;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface PaletteFilterResult<TValue = string> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly selected?: number;
  readonly selectedEntry?: SearchEntry<TValue>;
  readonly total: number;
  readonly start: number;
  readonly end: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export interface PaletteSelectionInput<TValue = string> {
  readonly index: PaletteIndex<TValue>;
  readonly state: PaletteState;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface PaletteGroup<TValue = string> {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly SearchEntry<TValue>[];
}

export type PaletteGroupSelector<TValue> = (entry: SearchEntry<TValue>) => {
  readonly id: string;
  readonly label?: string;
};

export function palettePresentation(state: PaletteState): PalettePresentation {
  return {
    query: state.query,
    selected: state.selectedIndex
  };
}

export function paletteReducer<TValue>(
  state: PaletteState,
  action: PaletteAction,
  options: PaletteReducerOptions<TValue>
): PaletteState {
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
        selectedIndex: wrapIndex(state.selectedIndex + action.delta, projectPaletteQuery(options.index, state.query).entries.length)
      };
    case 'selectIndex':
      return {
        ...state,
        selectedIndex: clampIndex(action.index, projectPaletteQuery(options.index, state.query).entries.length)
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

export function paletteWindow<TValue>(input: PaletteWindowInput<TValue>): PaletteFilterResult<TValue> {
  const projection = projectPaletteQuery(input.index, input.query ?? '');
  const filtered = projection.entries;
  const total = filtered.length;
  const limit = Math.max(1, Math.floor(input.limit ?? total));
  if (total === 0) {
    return {
      entries: [],
      total,
      start: 0,
      end: 0,
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
    ...(window.selectedVisibleIndex === undefined ? {} : { selected: window.selectedVisibleIndex }),
    ...(filtered[selectedAbsolute] === undefined ? {} : { selectedEntry: filtered[selectedAbsolute] }),
    total,
    start: window.start,
    end: window.end,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter
  };
}

export function selectedPaletteEntry<TValue>(input: PaletteSelectionInput<TValue>): SearchEntry<TValue> | undefined {
  return paletteWindow({
    index: input.index,
    query: input.state.query,
    selected: input.state.selectedIndex,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
    ...(input.limit === undefined ? {} : { limit: input.limit })
  }).selectedEntry;
}

export function groupPaletteEntries<TValue>(
  entries: readonly SearchEntry<TValue>[],
  groupFor: PaletteGroupSelector<TValue>
): readonly PaletteGroup<TValue>[] {
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

export function paletteStatus<TValue>(
  state: PaletteAsyncState<TValue>
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
  input: Pick<PaletteWindowInput<TValue>, 'selected' | 'selectedId'>
): number {
  if (input.selectedId !== undefined) {
    const byId = entries.findIndex((entry) => entry.id === input.selectedId);
    if (byId !== -1) return byId;
  }
  return clampIndex(input.selected ?? 0, entries.length);
}

export function paletteProjection<TValue>(index: PaletteIndex<TValue>, query = ''): PaletteQueryProjection<TValue> {
  return projectPaletteQuery(index, query);
}

function withoutPreview(state: PaletteState): PaletteState {
  return {
    query: state.query,
    selectedIndex: state.selectedIndex,
    selectedIds: state.selectedIds
  };
}
