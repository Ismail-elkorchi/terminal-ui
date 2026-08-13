import type { SplitPaneAction } from '../ui-model/split-pane.ts';

export interface SplitPaneConstraint {
  readonly minShare?: number;
  readonly maxShare?: number;
}

export interface SplitPaneDragState {
  readonly dividerIndex: number;
  readonly anchorShares: readonly number[];
}

export interface SplitPaneState {
  readonly shares: readonly number[];
  readonly activeDivider?: number;
  readonly drag?: SplitPaneDragState;
}

export interface SplitPaneReducerOptions {
  readonly constraints?: readonly SplitPaneConstraint[];
}

export interface SplitPanePresentation {
  readonly sizes: readonly { readonly kind: 'percent'; readonly value: number }[];
  readonly activeDivider?: number;
}

export function createSplitPaneState(
  paneCount: number,
  shares?: readonly number[]
): SplitPaneState {
  const normalized = normalizeShares(paneCount, shares);
  return {
    shares: normalized,
    ...(paneCount < 2 ? {} : { activeDivider: 0 })
  };
}

export function splitPaneReducer(
  state: SplitPaneState,
  action: SplitPaneAction,
  options: SplitPaneReducerOptions = {}
): SplitPaneState {
  const shares = normalizeShares(state.shares.length, state.shares);
  const dividerCount = Math.max(0, shares.length - 1);
  if (dividerCount === 0) return state;

  switch (action.kind) {
    case 'setActiveDivider':
      return validDivider(action.dividerIndex, dividerCount)
        ? withActiveDivider(state, shares, action.dividerIndex)
        : state;
    case 'moveActiveDivider':
      return withActiveDivider(
        state,
        shares,
        clampDivider((state.activeDivider ?? 0) + Math.sign(action.delta), dividerCount)
      );
    case 'firstActiveDivider':
      return withActiveDivider(state, shares, 0);
    case 'lastActiveDivider':
      return withActiveDivider(state, shares, dividerCount - 1);
    case 'resizeBy':
      return resizeState(state, shares, state.activeDivider ?? 0, action.deltaShare, options.constraints);
    case 'beginResize':
      return validDivider(action.dividerIndex, dividerCount)
        ? {
            ...withActiveDivider(state, shares, action.dividerIndex),
            drag: { dividerIndex: action.dividerIndex, anchorShares: shares }
          }
        : state;
    case 'resizeFromAnchor': {
      const drag = state.drag;
      if (drag?.dividerIndex !== action.dividerIndex) return state;
      return resizeState(state, drag.anchorShares, action.dividerIndex, action.deltaShare, options.constraints);
    }
    case 'endResize':
      return state.drag?.dividerIndex === action.dividerIndex ? withoutDrag(state) : state;
  }
}

export function splitPanePresentation(state: SplitPaneState): SplitPanePresentation {
  const shares = normalizeShares(state.shares.length, state.shares);
  return {
    sizes: shares.map((share) => ({ kind: 'percent', value: share * 100 })),
    ...(state.activeDivider === undefined ? {} : { activeDivider: state.activeDivider })
  };
}

function resizeState(
  state: SplitPaneState,
  baseShares: readonly number[],
  dividerIndex: number,
  requestedDelta: number,
  constraints: readonly SplitPaneConstraint[] | undefined
): SplitPaneState {
  if (!validDivider(dividerIndex, baseShares.length - 1) || !Number.isFinite(requestedDelta)) return state;
  const left = baseShares[dividerIndex] ?? 0;
  const right = baseShares[dividerIndex + 1] ?? 0;
  const leftConstraint = normalizedConstraint(constraints?.[dividerIndex]);
  const rightConstraint = normalizedConstraint(constraints?.[dividerIndex + 1]);
  const minimumDelta = Math.max(leftConstraint.min - left, right - rightConstraint.max);
  const maximumDelta = Math.min(leftConstraint.max - left, right - rightConstraint.min);
  const delta = Math.min(Math.max(requestedDelta, minimumDelta), maximumDelta);
  if (delta === 0) return withActiveDivider(state, state.shares, dividerIndex);
  const shares = baseShares.map((share, index) => {
    if (index === dividerIndex) return share + delta;
    if (index === dividerIndex + 1) return share - delta;
    return share;
  });
  return {
    ...state,
    shares,
    activeDivider: dividerIndex
  };
}

function normalizeShares(count: number, input: readonly number[] | undefined): readonly number[] {
  const paneCount = Math.max(0, Math.floor(count));
  if (paneCount === 0) return [];
  const values = input?.length === paneCount
    ? input.map((value) => Number.isFinite(value) ? Math.max(0, value) : 0)
    : Array.from({ length: paneCount }, () => 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  return total <= 0
    ? Array.from({ length: paneCount }, () => 1 / paneCount)
    : values.map((value) => value / total);
}

function normalizedConstraint(value: SplitPaneConstraint | undefined): { readonly min: number; readonly max: number } {
  const min = clampShare(value?.minShare ?? 0);
  const max = Math.max(min, clampShare(value?.maxShare ?? 1));
  return { min, max };
}

function clampShare(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function validDivider(index: number, count: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < count;
}

function clampDivider(index: number, count: number): number {
  return Math.min(Math.max(0, index), Math.max(0, count - 1));
}

function withActiveDivider(
  state: SplitPaneState,
  shares: readonly number[],
  activeDivider: number
): SplitPaneState {
  return {
    ...state,
    shares,
    activeDivider
  };
}

function withoutDrag(state: SplitPaneState): SplitPaneState {
  return {
    shares: state.shares,
    ...(state.activeDivider === undefined ? {} : { activeDivider: state.activeDivider })
  };
}
