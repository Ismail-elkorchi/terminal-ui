import { adjacentItemId } from './navigation.ts';
import type { NavigationPolicy } from './navigation.ts';

/** The committed-selection policy for an active-descendant collection. */
export type SelectionPolicy =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'single';
      readonly commitment: 'manual' | 'followActive';
    }
  | {
      readonly mode: 'multiple';
      readonly commitment: 'manual' | 'followActive';
      readonly range: boolean;
    };

export type SelectionState =
  | { readonly mode: 'none' }
  | { readonly mode: 'single'; readonly selectedId?: string }
  | {
      readonly mode: 'multiple';
      readonly selectedIds: readonly string[];
      readonly anchorId?: string;
    };

export interface CollectionInteractionState {
  /** The item at the keyboard/pointer navigation position. */
  readonly activeId?: string;
  /** Committed application selection, independent of activeId. */
  readonly selection: SelectionState;
}

export type CollectionInteractionAction =
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'commitActive' }
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'toggleSelection'; readonly id: string }
  | { readonly kind: 'selectRange'; readonly toId: string }
  | { readonly kind: 'clearSelection' };

export interface CollectionInteractionOptions {
  readonly enabledIds: readonly string[];
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
}

export const noSelection: SelectionPolicy = Object.freeze({ mode: 'none' });
export const manualSingleSelection: SelectionPolicy = Object.freeze({
  mode: 'single',
  commitment: 'manual',
});

export function collectionInteractionReducer(
  state: CollectionInteractionState,
  action: CollectionInteractionAction,
  options: CollectionInteractionOptions,
): CollectionInteractionState {
  const enabledIds = uniqueIds(options.enabledIds);
  const normalized = normalizeCollectionInteractionWithIds(state, enabledIds, options.selection);
  switch (action.kind) {
    case 'setActive':
      return setActive(normalized, validId(enabledIds, action.id), options.selection);
    case 'moveActive':
      return setActive(
        normalized,
        adjacentItemId(enabledIds, normalized.activeId, action.delta, options.navigation),
        options.selection,
      );
    case 'firstActive':
      return setActive(normalized, enabledIds[0], options.selection);
    case 'lastActive':
      return setActive(normalized, enabledIds.at(-1), options.selection);
    case 'commitActive':
      return normalized.activeId === undefined
        ? normalized
        : selectId(normalized, normalized.activeId, options.selection, false);
    case 'select':
      return enabledIds.includes(action.id)
        ? selectId(normalized, action.id, options.selection, false)
        : normalized;
    case 'toggleSelection':
      return enabledIds.includes(action.id)
        ? selectId(normalized, action.id, options.selection, true)
        : normalized;
    case 'selectRange':
      return selectRange(normalized, action.toId, enabledIds, options.selection);
    case 'clearSelection':
      return withSelection(normalized, emptySelection(options.selection));
  }
}

export function normalizeCollectionInteraction(
  state: CollectionInteractionState,
  enabledIds: readonly string[],
  policy: SelectionPolicy,
): CollectionInteractionState {
  const ids = uniqueIds(enabledIds);
  return normalizeCollectionInteractionWithIds(state, ids, policy);
}

function normalizeCollectionInteractionWithIds(
  state: CollectionInteractionState,
  ids: readonly string[],
  policy: SelectionPolicy,
): CollectionInteractionState {
  const activeId = validId(ids, state.activeId);
  const selection = normalizedSelection(state.selection, ids, policy);
  if (state.activeId === activeId && sameSelection(state.selection, selection)) return state;
  return Object.freeze({
    ...(activeId === undefined ? {} : { activeId }),
    selection,
  });
}

function setActive(
  state: CollectionInteractionState,
  activeId: string | undefined,
  policy: SelectionPolicy,
): CollectionInteractionState {
  const selection = activeId !== undefined && policy.mode !== 'none' && policy.commitment === 'followActive'
    ? selectionForId(activeId, policy)
    : state.selection;
  if (state.activeId === activeId && sameSelection(state.selection, selection)) return state;
  return Object.freeze({ ...(activeId === undefined ? {} : { activeId }), selection });
}

function selectId(
  state: CollectionInteractionState,
  id: string,
  policy: SelectionPolicy,
  toggle: boolean,
): CollectionInteractionState {
  const activeState = state.activeId === id ? state : Object.freeze({ ...state, activeId: id });
  if (policy.mode === 'none') return activeState;
  if (policy.mode === 'single') {
    const selectedId = toggle && activeState.selection.mode === 'single' && activeState.selection.selectedId === id
      ? undefined
      : id;
    return withSelection(activeState, Object.freeze({
      mode: 'single',
      ...(selectedId === undefined ? {} : { selectedId }),
    }));
  }
  const selected = new Set(activeState.selection.mode === 'multiple' ? activeState.selection.selectedIds : []);
  if (toggle && selected.has(id)) selected.delete(id);
  else if (toggle) selected.add(id);
  else {
    selected.clear();
    selected.add(id);
  }
  return withSelection(activeState, Object.freeze({
    mode: 'multiple',
    selectedIds: Object.freeze([...selected]),
    anchorId: id,
  }));
}

function selectRange(
  state: CollectionInteractionState,
  toId: string,
  enabledIds: readonly string[],
  policy: SelectionPolicy,
): CollectionInteractionState {
  if (policy.mode !== 'multiple' || !policy.range || !enabledIds.includes(toId)) return state;
  const anchor = state.selection.mode === 'multiple' && state.selection.anchorId !== undefined
    ? state.selection.anchorId
    : state.activeId ?? toId;
  const from = enabledIds.indexOf(anchor);
  const to = enabledIds.indexOf(toId);
  if (from < 0 || to < 0) return state;
  const selectedIds = Object.freeze(enabledIds.slice(Math.min(from, to), Math.max(from, to) + 1));
  return Object.freeze({
    activeId: toId,
    selection: Object.freeze({ mode: 'multiple', selectedIds, anchorId: anchor }),
  });
}

function normalizedSelection(
  state: SelectionState,
  enabledIds: readonly string[],
  policy: SelectionPolicy,
): SelectionState {
  if (policy.mode === 'none') return emptySelection(policy);
  if (policy.mode === 'single') {
    const candidate = state.mode === 'single'
      ? state.selectedId
      : state.mode === 'multiple' ? state.selectedIds[0] : undefined;
    const selectedId = validId(enabledIds, candidate);
    return Object.freeze({ mode: 'single', ...(selectedId === undefined ? {} : { selectedId }) });
  }
  const candidates = state.mode === 'multiple'
    ? state.selectedIds
    : state.mode === 'single' && state.selectedId !== undefined ? [state.selectedId] : [];
  const selected = new Set(candidates);
  const selectedIds = Object.freeze(enabledIds.filter((id) => selected.has(id)));
  const anchorId = state.mode === 'multiple' ? validId(enabledIds, state.anchorId) : undefined;
  return Object.freeze({
    mode: 'multiple',
    selectedIds,
    ...(anchorId === undefined ? {} : { anchorId }),
  });
}

function selectionForId(id: string, policy: Exclude<SelectionPolicy, { readonly mode: 'none' }>): SelectionState {
  return policy.mode === 'single'
    ? Object.freeze({ mode: 'single', selectedId: id })
    : Object.freeze({ mode: 'multiple', selectedIds: Object.freeze([id]), anchorId: id });
}

function emptySelection(policy: SelectionPolicy): SelectionState {
  if (policy.mode === 'none') return Object.freeze({ mode: 'none' });
  if (policy.mode === 'single') return Object.freeze({ mode: 'single' });
  return Object.freeze({ mode: 'multiple', selectedIds: Object.freeze([]) });
}

function withSelection(
  state: CollectionInteractionState,
  selection: SelectionState,
): CollectionInteractionState {
  return sameSelection(state.selection, selection)
    ? state
    : Object.freeze({ ...(state.activeId === undefined ? {} : { activeId: state.activeId }), selection });
}

function validId(ids: readonly string[], id: string | undefined): string | undefined {
  return id !== undefined && ids.includes(id) ? id : undefined;
}

function uniqueIds(ids: readonly string[]): readonly string[] {
  if (new Set(ids).size !== ids.length) throw new TypeError('Collection interaction ids must be unique.');
  return ids;
}

function sameSelection(left: SelectionState, right: SelectionState): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === 'none') return true;
  if (left.mode === 'single' && right.mode === 'single') return left.selectedId === right.selectedId;
  if (left.mode !== 'multiple' || right.mode !== 'multiple') return false;
  return left.anchorId === right.anchorId
    && left.selectedIds.length === right.selectedIds.length
    && left.selectedIds.every((id, index) => id === right.selectedIds[index]);
}
