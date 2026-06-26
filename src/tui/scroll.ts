export interface ScrollState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
  readonly followTail: boolean;
  readonly selectedIndex?: number;
}

export type ScrollAction =
  | { readonly kind: 'setContent'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'setViewport'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'scrollLines'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'scrollPages'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'top' }
  | { readonly kind: 'bottom' }
  | { readonly kind: 'itemIntoView'; readonly index: number }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export interface CreateScrollStateInput {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly viewportRows?: number;
  readonly viewportColumns?: number;
  readonly followTail?: boolean;
  readonly selectedIndex?: number;
}

export interface ScrollVisibleWindow {
  readonly start: number;
  readonly end: number;
}

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
      return normalizeScrollState({
        ...state,
        contentRows: action.rows ?? state.contentRows,
        contentColumns: action.columns ?? state.contentColumns,
        offsetRow: state.followTail && action.rows !== undefined
          ? bottomOffset(action.rows, state.viewportRows)
          : state.offsetRow
      });
    case 'setViewport':
      return normalizeScrollState({
        ...state,
        viewportRows: action.rows ?? state.viewportRows,
        viewportColumns: action.columns ?? state.viewportColumns
      });
    case 'scrollLines':
      return normalizeScrollState({
        ...state,
        offsetRow: state.offsetRow + (action.rows ?? 0),
        offsetColumn: state.offsetColumn + (action.columns ?? 0),
        followTail: action.rows === undefined || action.rows >= 0 ? state.followTail : false
      });
    case 'scrollPages':
      return normalizeScrollState({
        ...state,
        offsetRow: state.offsetRow + (action.rows ?? 0) * Math.max(1, state.viewportRows),
        offsetColumn: state.offsetColumn + (action.columns ?? 0) * Math.max(1, state.viewportColumns),
        followTail: action.rows === undefined || action.rows >= 0 ? state.followTail : false
      });
    case 'top':
      return normalizeScrollState({ ...state, offsetRow: 0, followTail: false });
    case 'bottom':
      return normalizeScrollState({ ...state, offsetRow: bottomOffset(state.contentRows, state.viewportRows), followTail: true });
    case 'itemIntoView':
      return normalizeScrollState({
        ...state,
        offsetRow: centeredOffset(state.contentRows, state.viewportRows, action.index),
        selectedIndex: normalizeSelectedIndex(action.index, state.contentRows),
        followTail: false
      });
    case 'setFollowTail':
      return normalizeScrollState({
        ...state,
        followTail: action.followTail,
        offsetRow: action.followTail ? bottomOffset(state.contentRows, state.viewportRows) : state.offsetRow
      });
  }
}

export function visibleWindowFromScroll(state: ScrollState): ScrollVisibleWindow {
  const normalized = normalizeScrollState(state);
  if (normalized.contentRows <= 0 || normalized.viewportRows <= 0) return { start: 0, end: 0 };
  const size = Math.min(normalized.contentRows, Math.max(1, normalized.viewportRows));
  return {
    start: normalized.offsetRow,
    end: Math.min(normalized.contentRows, normalized.offsetRow + size)
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

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
