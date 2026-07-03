import { editTextBuffer } from '../../text/index.ts';
import { rowWindow } from '../../tui/data-window.ts';
import type { ScrollState } from '../../tui/scroll.ts';
import type { WidgetSearchEntry } from '../contracts.ts';

export type PaletteAsyncState<TValue = string> =
  | { readonly status: 'idle'; readonly entries: readonly WidgetSearchEntry<TValue>[] }
  | { readonly status: 'loading'; readonly entries: readonly WidgetSearchEntry<TValue>[] }
  | { readonly status: 'error'; readonly entries: readonly WidgetSearchEntry<TValue>[]; readonly message: string };

export interface PaletteState {
  readonly query: string;
  readonly selectedIndex: number;
  readonly selectedIds: readonly string[];
  readonly previewId?: string;
}

export interface PaletteWindowInput<TValue = string> {
  readonly entries: readonly WidgetSearchEntry<TValue>[];
  readonly query?: string;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface PaletteFilterResult<TValue = string> {
  readonly entries: readonly WidgetSearchEntry<TValue>[];
  readonly selected?: number;
  readonly selectedEntry?: WidgetSearchEntry<TValue>;
  readonly total: number;
  readonly start: number;
  readonly end: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export interface PaletteSelectionInput<TValue = string> {
  readonly entries: readonly WidgetSearchEntry<TValue>[];
  readonly state: PaletteState;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export type PaletteAction =
  | { readonly kind: 'setQuery'; readonly query: string }
  | { readonly kind: 'insertQuery'; readonly text: string }
  | { readonly kind: 'deleteQueryBackward' }
  | { readonly kind: 'moveSelection'; readonly delta: number; readonly entryCount: number }
  | { readonly kind: 'moveFilteredSelection'; readonly delta: number; readonly entries: readonly WidgetSearchEntry[] }
  | { readonly kind: 'selectIndex'; readonly index: number; readonly entryCount: number }
  | { readonly kind: 'toggleSelected'; readonly id: string }
  | { readonly kind: 'clearSelected' }
  | { readonly kind: 'preview'; readonly id?: string };

export interface PaletteGroup<TValue = string> {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly WidgetSearchEntry<TValue>[];
}

export type PaletteGroupSelector<TValue> = (entry: WidgetSearchEntry<TValue>) => {
  readonly id: string;
  readonly label?: string;
};

export function paletteReducer(state: PaletteState, action: PaletteAction): PaletteState {
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
        selectedIndex: wrapIndex(state.selectedIndex + action.delta, action.entryCount)
      };
    case 'moveFilteredSelection':
      return {
        ...state,
        selectedIndex: wrapIndex(state.selectedIndex + action.delta, filterPaletteEntries(action.entries, state.query).length)
      };
    case 'selectIndex':
      return {
        ...state,
        selectedIndex: clampIndex(action.index, action.entryCount)
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
  const filtered = filterPaletteEntries(input.entries, input.query ?? '');
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

export function filterPaletteEntries<TValue>(
  entries: readonly WidgetSearchEntry<TValue>[],
  query: string
): readonly WidgetSearchEntry<TValue>[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return entries;
  return entries
    .map((entry, index) => ({ entry, index, score: paletteEntryScore(entry, normalized) }))
    .filter((result) => result.score !== undefined)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0) || left.index - right.index)
    .map((result) => result.entry);
}

export function selectedPaletteEntry<TValue>(input: PaletteSelectionInput<TValue>): WidgetSearchEntry<TValue> | undefined {
  return paletteWindow({
    entries: input.entries,
    query: input.state.query,
    selected: input.state.selectedIndex,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
    ...(input.limit === undefined ? {} : { limit: input.limit })
  }).selectedEntry;
}

export function groupPaletteEntries<TValue>(
  entries: readonly WidgetSearchEntry<TValue>[],
  groupFor: PaletteGroupSelector<TValue>
): readonly PaletteGroup<TValue>[] {
  const groups = new Map<string, { label: string; entries: WidgetSearchEntry<TValue>[] }>();
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
  entries: readonly WidgetSearchEntry<TValue>[],
  input: Pick<PaletteWindowInput<TValue>, 'selected' | 'selectedId'>
): number {
  if (input.selectedId !== undefined) {
    const byId = entries.findIndex((entry) => entry.id === input.selectedId);
    if (byId !== -1) return byId;
  }
  return clampIndex(input.selected ?? 0, entries.length);
}

function paletteEntryScore<TValue>(entry: WidgetSearchEntry<TValue>, query: string): number | undefined {
  const haystacks = [
    entry.label,
    entry.id,
    entry.description,
    ...(entry.keywords ?? [])
  ].filter((value): value is string => value !== undefined).map((value) => value.toLocaleLowerCase());
  let best: number | undefined;
  for (const haystack of haystacks) {
    const score = textScore(haystack, query);
    if (score !== undefined && (best === undefined || score < best)) best = score;
  }
  return best;
}

function textScore(text: string, query: string): number | undefined {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const includes = text.indexOf(query);
  if (includes !== -1) return 10 + includes;
  return subsequenceScore(text, query);
}

function subsequenceScore(text: string, query: string): number | undefined {
  let offset = 0;
  let score = 100;
  for (const character of query) {
    const found = text.indexOf(character, offset);
    if (found === -1) return undefined;
    score += found - offset;
    offset = found + 1;
  }
  return score;
}

function withoutPreview(state: PaletteState): PaletteState {
  return {
    query: state.query,
    selectedIndex: state.selectedIndex,
    selectedIds: state.selectedIds
  };
}
