import { finiteNonNegativeIntegerOrZero } from '../foundation/validation.ts';
import type {
  CreateScrollStateInput,
  ScrollAction,
  ScrollEvent,
  ScrollGeometry,
  ScrollState,
  ScrollVisibleWindow,
} from '../interaction/scroll.ts';

const unboundedGeometry: ScrollGeometry = Object.freeze({
  contentRows: Number.MAX_SAFE_INTEGER,
  contentColumns: Number.MAX_SAFE_INTEGER,
  viewportRows: 0,
  viewportColumns: 0,
});

export function createScrollState(input: CreateScrollStateInput = {}): ScrollState {
  return normalizeScrollState({
    offsetRow: input.offsetRow ?? 0,
    offsetColumn: input.offsetColumn ?? 0,
    followTail: input.followTail ?? false,
  });
}

export function scrollReducer(
  state: ScrollState,
  action: ScrollAction,
  geometry: ScrollGeometry = unboundedGeometry,
): ScrollState {
  const normalized = normalizeScrollState(state, geometry);
  switch (action.kind) {
    case 'setOffset':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...normalized,
        offsetRow: action.rows ?? normalized.offsetRow,
        offsetColumn: action.columns ?? normalized.offsetColumn,
        followTail: action.rows === undefined ? normalized.followTail : false,
      }, geometry));
    case 'scrollLines':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...normalized,
        offsetRow: normalized.offsetRow + (action.rows ?? 0),
        offsetColumn: normalized.offsetColumn + (action.columns ?? 0),
        followTail: action.rows === undefined || action.rows >= 0 ? normalized.followTail : false,
      }, geometry));
    case 'scrollPages':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...normalized,
        offsetRow: normalized.offsetRow + (action.rows ?? 0) * Math.max(1, geometry.viewportRows),
        offsetColumn: normalized.offsetColumn + (action.columns ?? 0) * Math.max(1, geometry.viewportColumns),
        followTail: action.rows === undefined || action.rows >= 0 ? normalized.followTail : false,
      }, geometry));
    case 'top':
      return preserveScrollIdentity(state, { ...normalized, offsetRow: 0, followTail: false });
    case 'bottom':
      return preserveScrollIdentity(state, {
        ...normalized,
        offsetRow: bottomOffset(geometry.contentRows, geometry.viewportRows),
        followTail: true,
      });
    case 'itemIntoView':
      return preserveScrollIdentity(state, {
        ...normalized,
        offsetRow: itemIntoViewOffset(
          normalized.offsetRow,
          geometry.contentRows,
          geometry.viewportRows,
          action.itemIndex,
          action.alignment,
        ),
        followTail: false,
      });
    case 'setFollowTail':
      return preserveScrollIdentity(state, {
        ...normalized,
        followTail: action.followTail,
        offsetRow: action.followTail
          ? bottomOffset(geometry.contentRows, geometry.viewportRows)
          : normalized.offsetRow,
      });
  }
}

export function applyScrollEvent(state: ScrollState, event: ScrollEvent): ScrollState {
  return preserveScrollIdentity(state, event.state);
}

export function visibleWindowFromScroll(
  state: ScrollState,
  geometry: ScrollGeometry,
): ScrollVisibleWindow {
  const normalized = normalizeScrollState(state, geometry);
  if (geometry.contentRows <= 0 || geometry.viewportRows <= 0) {
    return { startIndex: 0, endIndexExclusive: 0 };
  }
  const size = Math.min(geometry.contentRows, Math.max(1, geometry.viewportRows));
  return {
    startIndex: normalized.offsetRow,
    endIndexExclusive: Math.min(geometry.contentRows, normalized.offsetRow + size),
  };
}

export function normalizeScrollState(
  state: ScrollState,
  geometry: ScrollGeometry = unboundedGeometry,
): ScrollState {
  const contentRows = finiteNonNegativeIntegerOrZero(geometry.contentRows);
  const contentColumns = finiteNonNegativeIntegerOrZero(geometry.contentColumns);
  const viewportRows = finiteNonNegativeIntegerOrZero(geometry.viewportRows);
  const viewportColumns = finiteNonNegativeIntegerOrZero(geometry.viewportColumns);
  const normalized: ScrollState = {
    offsetRow: clamp(
      finiteNonNegativeIntegerOrZero(state.offsetRow),
      0,
      bottomOffset(contentRows, viewportRows),
    ),
    offsetColumn: clamp(
      finiteNonNegativeIntegerOrZero(state.offsetColumn),
      0,
      bottomOffset(contentColumns, viewportColumns),
    ),
    followTail: state.followTail,
  };
  return normalized.followTail
    ? { ...normalized, offsetRow: bottomOffset(contentRows, viewportRows) }
    : normalized;
}

function itemIntoViewOffset(
  currentOffset: number,
  total: number,
  size: number,
  preferredIndex: number,
  alignment: 'nearest' | 'start' | 'center' | 'end',
): number {
  if (total <= 0 || size <= 0) return 0;
  const windowSize = Math.min(total, Math.max(1, size));
  const normalizedPreferred = preferredIndex >= 0 && preferredIndex < total ? preferredIndex : 0;
  if (alignment === 'start') return clamp(normalizedPreferred, 0, total - windowSize);
  if (alignment === 'center') {
    return clamp(normalizedPreferred - Math.floor(windowSize / 2), 0, total - windowSize);
  }
  if (alignment === 'end') {
    return clamp(normalizedPreferred - windowSize + 1, 0, total - windowSize);
  }
  if (normalizedPreferred < currentOffset) return normalizedPreferred;
  if (normalizedPreferred >= currentOffset + windowSize) {
    return clamp(normalizedPreferred - windowSize + 1, 0, total - windowSize);
  }
  return currentOffset;
}

function bottomOffset(total: number, size: number): number {
  return Math.max(0, finiteNonNegativeIntegerOrZero(total) - finiteNonNegativeIntegerOrZero(size));
}

function preserveScrollIdentity(previous: ScrollState, next: ScrollState): ScrollState {
  return previous.offsetRow === next.offsetRow &&
      previous.offsetColumn === next.offsetColumn &&
      previous.followTail === next.followTail
    ? previous
    : Object.freeze(next);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
