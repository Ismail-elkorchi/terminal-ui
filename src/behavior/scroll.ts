import type {
  CreateScrollStateInput,
  ScrollAction,
  ScrollEvent,
  ScrollState,
  ScrollVisibleWindow
} from '../interaction/scroll.ts';

export function createScrollState(input: CreateScrollStateInput = {}): ScrollState {
  return normalizeScrollState({
    offsetRow: input.offsetRow ?? 0,
    offsetColumn: input.offsetColumn ?? 0,
    contentRows: input.contentRows ?? 0,
    contentColumns: input.contentColumns ?? 0,
    viewportRows: input.viewportRows ?? 0,
    viewportColumns: input.viewportColumns ?? 0,
    followTail: input.followTail ?? false,
    ...(input.selectedIndex === undefined ? {} : { selectedIndex: input.selectedIndex })
  });
}

export function scrollReducer(state: ScrollState, action: ScrollAction): ScrollState {
  switch (action.kind) {
    case 'setContent':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        contentRows: action.rows ?? state.contentRows,
        contentColumns: action.columns ?? state.contentColumns,
        offsetRow: state.followTail && action.rows !== undefined
          ? bottomOffset(action.rows, state.viewportRows)
          : state.offsetRow
      }));
    case 'setViewport':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        viewportRows: action.rows ?? state.viewportRows,
        viewportColumns: action.columns ?? state.viewportColumns
      }));
    case 'setOffset':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        offsetRow: action.rows ?? state.offsetRow,
        offsetColumn: action.columns ?? state.offsetColumn,
        followTail: action.rows === undefined ? state.followTail : false
      }));
    case 'scrollLines':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        offsetRow: state.offsetRow + (action.rows ?? 0),
        offsetColumn: state.offsetColumn + (action.columns ?? 0),
        followTail: action.rows === undefined || action.rows >= 0 ? state.followTail : false
      }));
    case 'scrollPages':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        offsetRow: state.offsetRow + (action.rows ?? 0) * Math.max(1, state.viewportRows),
        offsetColumn: state.offsetColumn + (action.columns ?? 0) * Math.max(1, state.viewportColumns),
        followTail: action.rows === undefined || action.rows >= 0 ? state.followTail : false
      }));
    case 'top':
      return preserveScrollIdentity(state, normalizeScrollState({ ...state, offsetRow: 0, followTail: false }));
    case 'bottom':
      return preserveScrollIdentity(state, normalizeScrollState({ ...state, offsetRow: bottomOffset(state.contentRows, state.viewportRows), followTail: true }));
    case 'itemIntoView':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        offsetRow: centeredOffset(state.contentRows, state.viewportRows, action.itemIndex),
        selectedIndex: normalizeSelectedIndex(action.itemIndex, state.contentRows),
        followTail: false
      }));
    case 'setFollowTail':
      return preserveScrollIdentity(state, normalizeScrollState({
        ...state,
        followTail: action.followTail,
        offsetRow: action.followTail ? bottomOffset(state.contentRows, state.viewportRows) : state.offsetRow
      }));
  }
}

export function applyScrollEvent(state: ScrollState, event: ScrollEvent): ScrollState {
  const reconciled = normalizeScrollState({
    ...state,
    offsetRow: event.scroll.offsetRow,
    offsetColumn: event.scroll.offsetColumn,
    contentRows: event.scroll.contentRows,
    contentColumns: event.scroll.contentColumns,
    viewportRows: event.scroll.viewportRows,
    viewportColumns: event.scroll.viewportColumns
  });
  return preserveScrollIdentity(state, scrollReducer(reconciled, event.action));
}

export function visibleWindowFromScroll(state: ScrollState): ScrollVisibleWindow {
  const normalized = normalizeScrollState(state);
  if (normalized.contentRows <= 0 || normalized.viewportRows <= 0) {
    return { startIndex: 0, endIndexExclusive: 0 };
  }
  const size = Math.min(normalized.contentRows, Math.max(1, normalized.viewportRows));
  return {
    startIndex: normalized.offsetRow,
    endIndexExclusive: Math.min(normalized.contentRows, normalized.offsetRow + size)
  };
}

export function normalizeScrollState(state: ScrollState): ScrollState {
  const contentRows = nonNegativeInteger(state.contentRows);
  const contentColumns = nonNegativeInteger(state.contentColumns);
  const viewportRows = nonNegativeInteger(state.viewportRows);
  const viewportColumns = nonNegativeInteger(state.viewportColumns);
  const normalized: ScrollState = {
    offsetRow: clamp(nonNegativeInteger(state.offsetRow), 0, bottomOffset(contentRows, viewportRows)),
    offsetColumn: clamp(nonNegativeInteger(state.offsetColumn), 0, bottomOffset(contentColumns, viewportColumns)),
    contentRows,
    contentColumns,
    viewportRows,
    viewportColumns,
    followTail: state.followTail,
    ...(state.selectedIndex === undefined
      ? {}
      : { selectedIndex: normalizeSelectedIndex(state.selectedIndex, contentRows) })
  };
  if (normalized.followTail) {
    return { ...normalized, offsetRow: bottomOffset(contentRows, viewportRows) };
  }
  return normalized;
}

function centeredOffset(total: number, size: number, preferredIndex: number): number {
  if (total <= 0 || size <= 0) return 0;
  const windowSize = Math.min(total, Math.max(1, size));
  const normalizedPreferred = preferredIndex >= 0 && preferredIndex < total ? preferredIndex : 0;
  const centered = normalizedPreferred - Math.floor(windowSize / 2);
  return clamp(centered, 0, total - windowSize);
}

function bottomOffset(total: number, size: number): number {
  return Math.max(0, nonNegativeInteger(total) - Math.max(0, nonNegativeInteger(size)));
}

function normalizeSelectedIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return clamp(Math.floor(index), 0, total - 1);
}

function preserveScrollIdentity(previous: ScrollState, next: ScrollState): ScrollState {
  return sameScrollState(previous, next) ? previous : next;
}

function sameScrollState(left: ScrollState, right: ScrollState): boolean {
  return left.offsetRow === right.offsetRow
    && left.offsetColumn === right.offsetColumn
    && left.contentRows === right.contentRows
    && left.contentColumns === right.contentColumns
    && left.viewportRows === right.viewportRows
    && left.viewportColumns === right.viewportColumns
    && left.followTail === right.followTail
    && left.selectedIndex === right.selectedIndex;
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
