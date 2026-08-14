import { adjacentItemId } from './navigation.ts';
import type { NavigationPolicy } from './navigation.ts';
import { isNonArrayObject } from '../foundation/validation.ts';

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
  readonly index: CollectionInteractionIndex;
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
}

declare const collectionInteractionIndexBrand: unique symbol;

export interface CollectionInteractionIndex {
  readonly [collectionInteractionIndexBrand]: true;
}

interface CollectionInteractionIndexData {
  readonly ids: readonly string[];
  readonly positions: ReadonlyMap<string, number>;
}

const collectionIndexes = new WeakMap<CollectionInteractionIndex, CollectionInteractionIndexData>();

export const noSelection: SelectionPolicy = Object.freeze({ mode: 'none' });
export const manualSingleSelection: SelectionPolicy = Object.freeze({
  mode: 'single',
  commitment: 'manual',
});

export function prepareCollectionInteractionIndex(value: unknown): CollectionInteractionIndex {
  if (!Array.isArray(value)) throw new TypeError('Collection interaction ids must be an array.');
  const ids = Object.freeze(value.map((id, position) =>
    selectionId(id, `Collection interaction ids[${String(position)}]`)
  ));
  const positions = new Map<string, number>();
  for (const [position, id] of ids.entries()) {
    if (positions.has(id)) throw new TypeError('Collection interaction ids must be unique.');
    positions.set(id, position);
  }
  const index = Object.freeze({}) as CollectionInteractionIndex;
  collectionIndexes.set(index, { ids, positions });
  return index;
}

export function collectionInteractionIds(index: CollectionInteractionIndex): readonly string[] {
  return collectionInteractionIndexData(index).ids;
}

export function collectionInteractionHas(index: CollectionInteractionIndex, id: string): boolean {
  return collectionInteractionIndexData(index).positions.has(id);
}

export function collectionInteractionPosition(
  index: CollectionInteractionIndex,
  id: string,
): number | undefined {
  return collectionInteractionIndexData(index).positions.get(id);
}

function collectionInteractionIndexData(index: CollectionInteractionIndex): CollectionInteractionIndexData {
  const data = collectionIndexes.get(index);
  if (data === undefined) {
    throw new TypeError('Collection interaction index must be created by prepareCollectionInteractionIndex().');
  }
  return data;
}

const emptySelectionState: SelectionState = Object.freeze({ mode: 'none' });

/** Validates and detaches collection selection retained by a component. */
export function ownSelectionState(value: unknown, subject: string): SelectionState {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const mode = value['mode'];
  if (mode === 'none') return emptySelectionState;
  if (mode === 'single') {
    const selectedId = optionalSelectionId(value['selectedId'], `${subject}.selectedId`);
    return Object.freeze({
      mode,
      ...(selectedId === undefined ? {} : { selectedId }),
    });
  }
  if (mode !== 'multiple') {
    throw new TypeError(`${subject}.mode must be none, single, or multiple.`);
  }
  const suppliedIds = value['selectedIds'];
  if (!Array.isArray(suppliedIds)) {
    throw new TypeError(`${subject}.selectedIds must be an array.`);
  }
  const selectedIds = Object.freeze(suppliedIds.map((id, index) =>
    selectionId(id, `${subject}.selectedIds[${String(index)}]`)
  ));
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new TypeError(`${subject}.selectedIds must be unique.`);
  }
  const anchorId = optionalSelectionId(value['anchorId'], `${subject}.anchorId`);
  return Object.freeze({
    mode,
    selectedIds,
    ...(anchorId === undefined ? {} : { anchorId }),
  });
}

export function collectionInteractionReducer(
  state: CollectionInteractionState,
  action: CollectionInteractionAction,
  options: CollectionInteractionOptions,
): CollectionInteractionState {
  const enabledIds = collectionInteractionIds(options.index);
  const normalized = normalizeCollectionInteractionWithIndex(state, options.index, options.selection);
  switch (action.kind) {
    case 'setActive':
      return setActive(normalized, validId(options.index, action.id), options.selection);
    case 'moveActive':
      return setActive(
        normalized,
        adjacentIndexedItemId(options.index, normalized.activeId, action.delta, options.navigation),
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
      return collectionInteractionHas(options.index, action.id)
        ? selectId(normalized, action.id, options.selection, false)
        : normalized;
    case 'toggleSelection':
      return collectionInteractionHas(options.index, action.id)
        ? selectId(normalized, action.id, options.selection, true)
        : normalized;
    case 'selectRange':
      return selectRange(normalized, action.toId, options.index, options.selection);
    case 'clearSelection':
      return withSelection(normalized, emptySelection(options.selection));
  }
}

export function normalizeCollectionInteraction(
  state: CollectionInteractionState,
  index: CollectionInteractionIndex,
  policy: SelectionPolicy,
): CollectionInteractionState {
  return normalizeCollectionInteractionWithIndex(state, index, policy);
}

function normalizeCollectionInteractionWithIndex(
  state: CollectionInteractionState,
  index: CollectionInteractionIndex,
  policy: SelectionPolicy,
): CollectionInteractionState {
  const activeId = validId(index, state.activeId);
  const selection = normalizedSelection(state.selection, index, policy);
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
  index: CollectionInteractionIndex,
  policy: SelectionPolicy,
): CollectionInteractionState {
  if (policy.mode !== 'multiple' || !policy.range || !collectionInteractionHas(index, toId)) return state;
  const anchor = state.selection.mode === 'multiple' && state.selection.anchorId !== undefined
    ? state.selection.anchorId
    : state.activeId ?? toId;
  const from = collectionInteractionPosition(index, anchor) ?? -1;
  const to = collectionInteractionPosition(index, toId) ?? -1;
  if (from < 0 || to < 0) return state;
  const selectedIds = Object.freeze(collectionInteractionIds(index).slice(Math.min(from, to), Math.max(from, to) + 1));
  return Object.freeze({
    activeId: toId,
    selection: Object.freeze({ mode: 'multiple', selectedIds, anchorId: anchor }),
  });
}

function normalizedSelection(
  state: SelectionState,
  index: CollectionInteractionIndex,
  policy: SelectionPolicy,
): SelectionState {
  if (policy.mode === 'none') return emptySelection(policy);
  if (policy.mode === 'single') {
    const candidate = state.mode === 'single'
      ? state.selectedId
      : state.mode === 'multiple' ? state.selectedIds[0] : undefined;
    const selectedId = validId(index, candidate);
    return Object.freeze({ mode: 'single', ...(selectedId === undefined ? {} : { selectedId }) });
  }
  const candidates = state.mode === 'multiple'
    ? state.selectedIds
    : state.mode === 'single' && state.selectedId !== undefined ? [state.selectedId] : [];
  const selected = new Set(candidates);
  const selectedIds = Object.freeze(collectionInteractionIds(index).filter((id) => selected.has(id)));
  const anchorId = state.mode === 'multiple' ? validId(index, state.anchorId) : undefined;
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
  if (policy.mode === 'none') return emptySelectionState;
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

function validId(index: CollectionInteractionIndex, id: string | undefined): string | undefined {
  return id !== undefined && collectionInteractionHas(index, id) ? id : undefined;
}

function adjacentIndexedItemId(
  index: CollectionInteractionIndex,
  currentId: string | undefined,
  delta: number,
  navigation: NavigationPolicy | undefined,
): string | undefined {
  const ids = collectionInteractionIds(index);
  if (ids.length === 0) return undefined;
  const current = currentId === undefined ? undefined : collectionInteractionPosition(index, currentId);
  if (current === undefined) return delta < 0 ? ids.at(-1) : ids[0];
  return adjacentItemId(ids, currentId, delta, navigation);
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

function selectionId(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${subject} must be a non-empty string.`);
  }
  return value;
}

function optionalSelectionId(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : selectionId(value, subject);
}
