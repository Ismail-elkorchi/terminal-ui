import type { Rect } from './layout.ts';

export type LayoutTrack =
  | { readonly kind: 'fixed'; readonly size: number }
  | { readonly kind: 'percent'; readonly percent: number }
  | { readonly kind: 'fill'; readonly weight?: number };

export interface Screen<TState = unknown> {
  readonly id: string;
  readonly state: TState;
}

export interface ScreenStack<TState = unknown> {
  readonly screens: readonly Screen<TState>[];
}

export type ScreenStackAction<TState = unknown> =
  | { readonly kind: 'push'; readonly screen: Screen<TState> }
  | { readonly kind: 'pop' }
  | { readonly kind: 'replace'; readonly screen: Screen<TState> }
  | { readonly kind: 'reset'; readonly screens: readonly Screen<TState>[] };

export function splitTracks(bounds: Rect, orientation: 'horizontal' | 'vertical', tracks: readonly LayoutTrack[]): readonly Rect[] {
  const total = orientation === 'horizontal' ? bounds.width : bounds.height;
  const sizes = resolveTrackSizes(total, tracks);
  let row = bounds.row;
  let column = bounds.column;
  return sizes.map((size) => {
    const rect = orientation === 'horizontal'
      ? { row: bounds.row, column, width: size, height: bounds.height }
      : { row, column: bounds.column, width: bounds.width, height: size };
    if (orientation === 'horizontal') column += size;
    else row += size;
    return clampRect(rect);
  });
}

export function gridCellRects(
  bounds: Rect,
  rows: readonly LayoutTrack[],
  columns: readonly LayoutTrack[]
): readonly Rect[] {
  const rowRects = splitTracks(bounds, 'vertical', rows);
  const columnRects = splitTracks(bounds, 'horizontal', columns);
  return rowRects.flatMap((rowRect) => columnRects.map((columnRect) => ({
    row: rowRect.row,
    column: columnRect.column,
    width: columnRect.width,
    height: rowRect.height
  })));
}

export function screenStackReducer<TState>(
  stack: ScreenStack<TState>,
  action: ScreenStackAction<TState>
): ScreenStack<TState> {
  switch (action.kind) {
    case 'push':
      return { screens: [...stack.screens, action.screen] };
    case 'pop':
      return { screens: stack.screens.slice(0, -1) };
    case 'replace':
      return { screens: [...stack.screens.slice(0, -1), action.screen] };
    case 'reset':
      return { screens: action.screens };
  }
}

export function activeScreen<TState>(stack: ScreenStack<TState>): Screen<TState> | undefined {
  return stack.screens.at(-1);
}

function resolveTrackSizes(total: number, tracks: readonly LayoutTrack[]): readonly number[] {
  if (tracks.length === 0) return [];
  const safeTotal = Math.max(0, Math.floor(total));
  const fixed = tracks.map((track) => track.kind === 'fixed' ? Math.max(0, Math.floor(track.size)) : 0);
  const percent = tracks.map((track) => track.kind === 'percent'
    ? Math.max(0, Math.floor(safeTotal * Math.max(0, track.percent) / 100))
    : 0);
  const claimed = fixed.reduce((sum, value) => sum + value, 0) + percent.reduce((sum, value) => sum + value, 0);
  const fillTracks = tracks.map((track) => track.kind === 'fill' ? Math.max(1, Math.floor(track.weight ?? 1)) : 0);
  const fillWeight = fillTracks.reduce((sum, value) => sum + value, 0);
  const remaining = Math.max(0, safeTotal - claimed);
  const sizes = tracks.map((track, index) => {
    if (track.kind === 'fixed') return fixed[index] ?? 0;
    if (track.kind === 'percent') return percent[index] ?? 0;
    const weight = fillTracks[index] ?? 1;
    const size = fillWeight === 0 ? 0 : Math.floor(remaining * weight / fillWeight);
    return size;
  });
  const lastFill = sizes.findLastIndex((_size, index) => tracks[index]?.kind === 'fill');
  if (lastFill !== -1) {
    const delta = safeTotal - sizes.reduce((sum, value) => sum + value, 0);
    return sizes.map((size, index) => index === lastFill ? size + delta : size);
  }
  return fitSizes(sizes, safeTotal);
}

function fitSizes(sizes: readonly number[], total: number): readonly number[] {
  let remaining = total;
  return sizes.map((size, index) => {
    if (index === sizes.length - 1) return Math.max(0, remaining);
    const fitted = Math.min(size, remaining);
    remaining -= fitted;
    return fitted;
  });
}

function clampRect(bounds: Rect): Rect {
  return {
    row: Math.max(1, bounds.row),
    column: Math.max(1, bounds.column),
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height)
  };
}
