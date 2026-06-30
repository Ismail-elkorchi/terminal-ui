export interface WindowGeometry {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly height: number;
}

export type WindowAction =
  | { readonly type: 'moveBy'; readonly rows?: number; readonly columns?: number }
  | { readonly type: 'moveTo'; readonly row: number; readonly column: number }
  | { readonly type: 'resizeBy'; readonly rows?: number; readonly columns?: number }
  | { readonly type: 'resizeTo'; readonly width: number; readonly height: number };

export interface WindowReducerOptions {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly viewport?: {
    readonly columns: number;
    readonly rows: number;
  };
}

export function windowReducer(
  state: WindowGeometry,
  action: WindowAction,
  options: WindowReducerOptions = {}
): WindowGeometry {
  const next = applyWindowAction(state, action);
  return clampWindow(next, options);
}

function applyWindowAction(state: WindowGeometry, action: WindowAction): WindowGeometry {
  if (action.type === 'moveBy') {
    return {
      ...state,
      row: state.row + Math.floor(action.rows ?? 0),
      column: state.column + Math.floor(action.columns ?? 0)
    };
  }
  if (action.type === 'moveTo') {
    return {
      ...state,
      row: Math.floor(action.row),
      column: Math.floor(action.column)
    };
  }
  if (action.type === 'resizeBy') {
    return {
      ...state,
      width: state.width + Math.floor(action.columns ?? 0),
      height: state.height + Math.floor(action.rows ?? 0)
    };
  }
  return {
    ...state,
    width: Math.floor(action.width),
    height: Math.floor(action.height)
  };
}

function clampWindow(state: WindowGeometry, options: WindowReducerOptions): WindowGeometry {
  const minWidth = normalizeBound(options.minWidth, 4);
  const minHeight = normalizeBound(options.minHeight, 3);
  const viewportColumns = normalizeBound(options.viewport?.columns, Number.POSITIVE_INFINITY);
  const viewportRows = normalizeBound(options.viewport?.rows, Number.POSITIVE_INFINITY);
  const maxWidth = Math.max(minWidth, Math.min(normalizeBound(options.maxWidth, viewportColumns), viewportColumns));
  const maxHeight = Math.max(minHeight, Math.min(normalizeBound(options.maxHeight, viewportRows), viewportRows));
  const width = clamp(Math.floor(state.width), minWidth, maxWidth);
  const height = clamp(Math.floor(state.height), minHeight, maxHeight);
  const maxColumn = Number.isFinite(viewportColumns) ? Math.max(0, viewportColumns - width) : Math.floor(state.column);
  const maxRow = Number.isFinite(viewportRows) ? Math.max(0, viewportRows - height) : Math.floor(state.row);
  return {
    row: clamp(Math.floor(state.row), 0, maxRow),
    column: clamp(Math.floor(state.column), 0, maxColumn),
    width,
    height
  };
}

function normalizeBound(value: number | undefined, fallback: number): number {
  return value === undefined || Number.isNaN(value) ? fallback : Math.max(0, Math.floor(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
