import type { PaletteEntry } from '../types.ts';

export type PaletteAsyncState<TValue = string> =
  | { readonly status: 'idle'; readonly entries: readonly PaletteEntry<TValue>[] }
  | { readonly status: 'loading'; readonly entries: readonly PaletteEntry<TValue>[] }
  | { readonly status: 'error'; readonly entries: readonly PaletteEntry<TValue>[]; readonly message: string };

export interface PaletteState {
  readonly query: string;
  readonly selectedIndex: number;
  readonly selectedIds: readonly string[];
  readonly previewId?: string;
}

export type PaletteAction =
  | { readonly kind: 'setQuery'; readonly query: string }
  | { readonly kind: 'moveSelection'; readonly delta: number; readonly entryCount: number }
  | { readonly kind: 'selectIndex'; readonly index: number; readonly entryCount: number }
  | { readonly kind: 'toggleSelected'; readonly id: string }
  | { readonly kind: 'clearSelected' }
  | { readonly kind: 'preview'; readonly id?: string };

export interface PaletteGroup<TValue = string> {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly PaletteEntry<TValue>[];
}

export type PaletteGroupSelector<TValue> = (entry: PaletteEntry<TValue>) => {
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
    case 'moveSelection':
      return {
        ...state,
        selectedIndex: wrapIndex(state.selectedIndex + action.delta, action.entryCount)
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

export function groupPaletteEntries<TValue>(
  entries: readonly PaletteEntry<TValue>[],
  groupFor: PaletteGroupSelector<TValue>
): readonly PaletteGroup<TValue>[] {
  const groups = new Map<string, { label: string; entries: PaletteEntry<TValue>[] }>();
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

function withoutPreview(state: PaletteState): PaletteState {
  return {
    query: state.query,
    selectedIndex: state.selectedIndex,
    selectedIds: state.selectedIds
  };
}
