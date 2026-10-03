import { assertOrderedSource, createOrderedSource, appendOrderedItems, type OrderedSource } from '../foundation/ordered-source.ts';
import { finishWork } from '../foundation/cooperative-work.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { NavigationPolicy } from './navigation.ts';
import { navigateIndex } from './navigation.ts';

export type SelectionState =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'single';
      readonly selectedId?: string;
      readonly selectionFollowsActive?: boolean;
    }
  | {
      readonly mode: 'multiple';
      readonly selectedIds: readonly string[];
      readonly anchorId?: string;
      readonly rangeSelectionEnabled?: boolean;
    };

export interface CollectionInteractionState {
  /** The item at the keyboard/pointer navigation position. */
  readonly activeId?: string;
  /** Committed application selection, independent of activeId. */
  readonly selection: SelectionState;
}

export type CollectionInteractionTransition =
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
  readonly navigation?: NavigationPolicy;
}

declare const collectionInteractionIndexBrand: unique symbol;

export interface CollectionInteractionIndex {
  readonly [collectionInteractionIndexBrand]: true;
}

interface CollectionInteractionIndexData {
  readonly count: number;
  readonly orderCount: number;
  readonly idAt: (rank: number) => string | undefined;
  readonly rank: (id: string) => number | undefined;
  readonly orderRank: (id: string) => number | undefined;
}

const collectionIndexes = new WeakMap<CollectionInteractionIndex, CollectionInteractionIndexData>();

export const noSelection: SelectionState = Object.freeze({ mode: 'none' });

export function selectionContains(selection: SelectionState, id: string): boolean {
  return selection.mode === 'single'
    ? selection.selectedId === id
    : selection.mode === 'multiple' && selection.selectedIds.includes(id);
}

export function createCollectionInteractionIndex(value: unknown): CollectionInteractionIndex {
  return finishWork(createCollectionInteractionIndexWork(value));
}

/** Bounded construction shared by cooperative collection projections. */
export function* createCollectionInteractionIndexWork(value: unknown): Generator<number, CollectionInteractionIndex> {
  if (!Array.isArray(value)) throw new TypeError('Collection interaction ids must be an array.');
  let source = createOrderedSource<{ readonly id: string }>();
  for (let position = 0; position < value.length; position += 1) {
    const id = selectionId(value[position], `Collection interaction ids[${String(position)}]`);
    source = appendOrderedItems(source, [{ id, value: Object.freeze({ id }) }]);
    yield 1;
  }
  return createCollectionInteractionIndexFromSource(source);
}

/** Retains the source's rank/select tree; no duplicate identity maps or enabled arrays. */
export function createCollectionInteractionIndexFromSource<T extends { readonly id: string }>(source: OrderedSource<T>): CollectionInteractionIndex {
  assertOrderedSource(source);
  const index = Object.freeze({}) as CollectionInteractionIndex;
  collectionIndexes.set(index, Object.freeze({
    count: source.enabledCount, orderCount: source.count,
    idAt: (rank: number) => source.enabledAt(rank)?.id,
    rank: source.enabledRank, orderRank: source.rank,
  }));
  return index;
}

/** One ordered projection owns result rank and enabled navigation together. */
export function createCollectionInteractionOrderBuilder<T>(): {
  readonly add: (item: T, id: string, disabled?: boolean) => void;
  readonly has: (id: string) => boolean;
  readonly finish: () => { readonly items: readonly T[]; readonly index: CollectionInteractionIndex };
} {
  const items: T[] = [];
  let source = createOrderedSource<{ readonly id: string }>();
  let finished = false;
  return {
    has: id => source.rank(id) !== undefined,
    add(item, value, disabled = false) {
      if (finished) throw new TypeError('Collection order is already finished.');
      const id = selectionId(value, 'Collection interaction id');
      source = appendOrderedItems(source, [{ id, value: Object.freeze({ id }), disabled }]);
      items.push(item);
    },
    finish() {
      if (finished) throw new TypeError('Collection order is already finished.');
      finished = true;
      return { items: Object.freeze(items), index: createCollectionInteractionIndexFromSource(source) };
    },
  };
}

/** Absolute result rank includes disabled items, unlike keyboard navigation rank. */
export function collectionInteractionOrderPosition(index: CollectionInteractionIndex, id: string): number | undefined {
  return collectionInteractionIndexData(index).orderRank(id);
}

/** Storage retained by an ordered projection, excluding its item payloads. */
export function collectionInteractionIndexStorageBytes(index: CollectionInteractionIndex): number {
  const data = collectionInteractionIndexData(index);
  return 64 + data.orderCount * 128;
}

export function collectionInteractionIds(index: CollectionInteractionIndex): readonly string[] {
  const data = collectionInteractionIndexData(index);
  return Object.freeze(Array.from({ length: data.count }, (_, rank) => requireInteractionId(data.idAt(rank))));
}

export function collectionInteractionHas(index: CollectionInteractionIndex, id: string): boolean {
  return collectionInteractionPosition(index, id) !== undefined;
}

export function collectionInteractionPosition(
  index: CollectionInteractionIndex,
  id: string,
): number | undefined {
  return collectionInteractionIndexData(index).rank(id);
}

export function assertCollectionInteractionReferences(
  state: CollectionInteractionState,
  index: CollectionInteractionIndex,
  subject: string,
): void {
  if (state.activeId !== undefined && !collectionInteractionHas(index, state.activeId)) {
    throw new RangeError(`${subject}.activeId must identify an available item.`);
  }
  if (state.selection.mode === 'single') {
    if (state.selection.selectedId !== undefined && !collectionInteractionHas(index, state.selection.selectedId)) {
      throw new RangeError(`${subject}.selection.selectedId must identify an available item.`);
    }
    return;
  }
  if (state.selection.mode === 'multiple') {
    for (const id of state.selection.selectedIds) {
      if (!collectionInteractionHas(index, id)) {
        throw new RangeError(`${subject}.selection.selectedIds must identify available items.`);
      }
    }
    if (state.selection.anchorId !== undefined && !collectionInteractionHas(index, state.selection.anchorId)) {
      throw new RangeError(`${subject}.selection.anchorId must identify an available item.`);
    }
  }
}

function collectionInteractionIndexData(index: CollectionInteractionIndex): CollectionInteractionIndexData {
  const data = collectionIndexes.get(index);
  if (data === undefined) {
    throw new TypeError('Collection interaction index must be created by createCollectionInteractionIndex().');
  }
  return data;
}

const emptySelectionState: SelectionState = Object.freeze({ mode: 'none' });

/** Validates and detaches collection selection retained by a component. */
export function decodeSelectionState(value: unknown, subject: string): SelectionState {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const mode = value['mode'];
  if (mode === 'none') return emptySelectionState;
  if (mode === 'single') {
    const selectedId = optionalSelectionId(value['selectedId'], `${subject}.selectedId`);
    const selectionFollowsActive = optionalBoolean(
      value['selectionFollowsActive'],
      `${subject}.selectionFollowsActive`,
    );
    return Object.freeze({
      mode,
      ...(selectedId === undefined ? {} : { selectedId }),
      ...(selectionFollowsActive === undefined ? {} : { selectionFollowsActive }),
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
  const rangeSelectionEnabled = optionalBoolean(
    value['rangeSelectionEnabled'],
    `${subject}.rangeSelectionEnabled`,
  );
  return Object.freeze({
    mode,
    selectedIds,
    ...(anchorId === undefined ? {} : { anchorId }),
    ...(rangeSelectionEnabled === undefined ? {} : { rangeSelectionEnabled }),
  });
}

export function collectionInteractionReducer(
  state: CollectionInteractionState,
  transition: CollectionInteractionTransition,
  options: CollectionInteractionOptions,
): CollectionInteractionState {
  const enabled = collectionInteractionIndexData(options.index);
  const normalized = normalizeCollectionInteractionWithIndex(state, options.index);
  switch (transition.kind) {
    case 'setActive':
      return setActive(normalized, validId(options.index, transition.id));
    case 'moveActive':
      return setActive(
        normalized,
        adjacentIndexedItemId(options.index, normalized.activeId, transition.delta, options.navigation),
      );
    case 'firstActive':
      return setActive(normalized, enabled.idAt(0));
    case 'lastActive':
      return setActive(normalized, enabled.idAt(enabled.count - 1));
    case 'commitActive':
      return normalized.activeId === undefined
        ? normalized
        : selectId(normalized, normalized.activeId, false);
    case 'select':
      return collectionInteractionHas(options.index, transition.id)
        ? selectId(normalized, transition.id, false)
        : normalized;
    case 'toggleSelection':
      return collectionInteractionHas(options.index, transition.id)
        ? selectId(normalized, transition.id, true)
        : normalized;
    case 'selectRange':
      return selectRange(normalized, transition.toId, options.index);
    case 'clearSelection':
      return withSelection(normalized, emptySelection(normalized.selection));
  }
}

export function normalizeCollectionInteraction(
  state: CollectionInteractionState,
  index: CollectionInteractionIndex,
): CollectionInteractionState {
  return normalizeCollectionInteractionWithIndex(state, index);
}

function normalizeCollectionInteractionWithIndex(
  state: CollectionInteractionState,
  index: CollectionInteractionIndex,
): CollectionInteractionState {
  const activeId = validId(index, state.activeId);
  const selection = normalizedSelection(state.selection, index);
  if (state.activeId === activeId && sameSelection(state.selection, selection)) return state;
  return Object.freeze({
    ...(activeId === undefined ? {} : { activeId }),
    selection,
  });
}

function setActive(
  state: CollectionInteractionState,
  activeId: string | undefined,
): CollectionInteractionState {
  const selection = activeId !== undefined
    && state.selection.mode === 'single'
    && state.selection.selectionFollowsActive === true
    ? selectionForId(activeId)
    : state.selection;
  if (state.activeId === activeId && sameSelection(state.selection, selection)) return state;
  return Object.freeze({ ...(activeId === undefined ? {} : { activeId }), selection });
}

function selectId(
  state: CollectionInteractionState,
  id: string,
  toggle: boolean,
): CollectionInteractionState {
  const activeState = state.activeId === id ? state : Object.freeze({ ...state, activeId: id });
  if (state.selection.mode === 'none') return activeState;
  if (state.selection.mode === 'single') {
    const selectedId = toggle && activeState.selection.mode === 'single' && activeState.selection.selectedId === id
      ? undefined
      : id;
    return withSelection(activeState, Object.freeze({
      mode: 'single',
      ...(selectedId === undefined ? {} : { selectedId }),
      ...(state.selection.selectionFollowsActive === undefined
        ? {}
        : { selectionFollowsActive: state.selection.selectionFollowsActive }),
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
    ...(state.selection.rangeSelectionEnabled === undefined
      ? {}
      : { rangeSelectionEnabled: state.selection.rangeSelectionEnabled }),
  }));
}

function selectRange(
  state: CollectionInteractionState,
  toId: string,
  index: CollectionInteractionIndex,
): CollectionInteractionState {
  if (
    state.selection.mode !== 'multiple'
    || state.selection.rangeSelectionEnabled !== true
    || !collectionInteractionHas(index, toId)
  ) {
    return state;
  }
  const anchor = state.selection.anchorId ?? state.activeId ?? toId;
  const from = collectionInteractionPosition(index, anchor) ?? -1;
  const to = collectionInteractionPosition(index, toId) ?? -1;
  if (from < 0 || to < 0) return state;
  const data = collectionInteractionIndexData(index);
  const selectedIds = Object.freeze(Array.from({ length: Math.abs(to - from) + 1 }, (_, offset) => requireInteractionId(data.idAt(Math.min(from, to) + offset))));
  return Object.freeze({
    activeId: toId,
    selection: Object.freeze({
      mode: 'multiple',
      selectedIds,
      anchorId: anchor,
      rangeSelectionEnabled: true,
    }),
  });
}

function normalizedSelection(
  state: SelectionState,
  index: CollectionInteractionIndex,
): SelectionState {
  if (state.mode === 'none') return noSelection;
  if (state.mode === 'single') {
    const selectedId = validId(index, state.selectedId);
    return Object.freeze({
      mode: 'single',
      ...(selectedId === undefined ? {} : { selectedId }),
      ...(state.selectionFollowsActive === undefined
        ? {}
        : { selectionFollowsActive: state.selectionFollowsActive }),
    });
  }
  const candidates = state.selectedIds;
  const selectedIds = Object.freeze([...new Set(candidates)]
    .filter(id => collectionInteractionHas(index, id))
    .sort((left, right) => (collectionInteractionPosition(index, left) ?? 0) - (collectionInteractionPosition(index, right) ?? 0)));
  const anchorId = validId(index, state.anchorId);
  return Object.freeze({
    mode: 'multiple',
    selectedIds,
    ...(anchorId === undefined ? {} : { anchorId }),
    ...(state.rangeSelectionEnabled === undefined
      ? {}
      : { rangeSelectionEnabled: state.rangeSelectionEnabled }),
  });
}

function selectionForId(id: string): SelectionState {
  return Object.freeze({ mode: 'single', selectedId: id, selectionFollowsActive: true });
}

function emptySelection(selection: SelectionState): SelectionState {
  if (selection.mode === 'none') return emptySelectionState;
  if (selection.mode === 'single') {
    return Object.freeze({
      mode: 'single',
      ...(selection.selectionFollowsActive === undefined
        ? {}
        : { selectionFollowsActive: selection.selectionFollowsActive }),
    });
  }
  return Object.freeze({
    mode: 'multiple',
    selectedIds: Object.freeze([]),
    ...(selection.rangeSelectionEnabled === undefined
      ? {}
      : { rangeSelectionEnabled: selection.rangeSelectionEnabled }),
  });
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
  const data = collectionInteractionIndexData(index);
  const current = currentId === undefined ? undefined : collectionInteractionPosition(index, currentId);
  return data.idAt(navigateIndex(current, delta, data.count, navigation));
}

function sameSelection(left: SelectionState, right: SelectionState): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === 'none') return true;
  if (left.mode === 'single' && right.mode === 'single') {
    return left.selectedId === right.selectedId
      && left.selectionFollowsActive === right.selectionFollowsActive;
  }
  if (left.mode !== 'multiple' || right.mode !== 'multiple') return false;
  return left.anchorId === right.anchorId
    && left.rangeSelectionEnabled === right.rangeSelectionEnabled
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

function optionalBoolean(value: unknown, subject: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${subject} must be a boolean.`);
  return value;
}

export function collectionInteractionCount(index: CollectionInteractionIndex): number {
  return collectionInteractionIndexData(index).count;
}
export function collectionInteractionIdAt(index: CollectionInteractionIndex, rank: number): string | undefined {
  return collectionInteractionIndexData(index).idAt(rank);
}

function requireInteractionId(value: string | undefined): string {
  if (value === undefined) throw new RangeError('Collection interaction rank is outside its source.');
  return value;
}
