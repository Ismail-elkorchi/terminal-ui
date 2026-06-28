import type { Rect } from './layout.ts';

export type LayoutSize =
  | { readonly kind: 'fixed'; readonly cells: number }
  | { readonly kind: 'percent'; readonly value: number }
  | { readonly kind: 'fill'; readonly weight?: number }
  | { readonly kind: 'content'; readonly min?: number; readonly max?: number };

export interface LayoutInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type LayoutAlignment = 'start' | 'center' | 'end' | 'stretch';
export type LayoutJustification = 'start' | 'center' | 'end' | 'stretch';
export type LayoutOverflow = 'clip' | 'visible';

export type LayoutInsetInput =
  | number
  | {
      readonly top?: number;
      readonly right?: number;
      readonly bottom?: number;
      readonly left?: number;
    };

export interface LayoutFlowOptions {
  readonly gap?: number;
  readonly padding?: LayoutInsetInput;
  readonly margin?: LayoutInsetInput;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: LayoutAlignment;
  readonly justify?: LayoutJustification;
  readonly overflow?: LayoutOverflow;
}

export interface GridLayoutOptions extends LayoutFlowOptions {
  readonly rowGap?: number;
  readonly columnGap?: number;
}

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

export function splitTracks(
  bounds: Rect,
  orientation: 'horizontal' | 'vertical',
  tracks: readonly LayoutSize[],
  options: LayoutFlowOptions = {},
  contentSizes: readonly number[] = []
): readonly Rect[] {
  const contentBounds = layoutContentBounds(bounds, options);
  const totalDimension = orientation === 'horizontal' ? contentBounds.width : contentBounds.height;
  const gap = normalizedGap(options.gap);
  const total = Math.max(0, totalDimension - gap * Math.max(0, tracks.length - 1));
  const sizes = resolveTrackSizes(total, tracks, contentSizes);
  let row = contentBounds.row;
  let column = contentBounds.column;
  return sizes.map((size) => {
    const rect = orientation === 'horizontal'
      ? { row: contentBounds.row, column, width: size, height: contentBounds.height }
      : { row, column: contentBounds.column, width: contentBounds.width, height: size };
    if (orientation === 'horizontal') column += size + gap;
    else row += size + gap;
    return clampRect(rect);
  });
}

export function gridCellRects(
  bounds: Rect,
  rows: readonly LayoutSize[],
  columns: readonly LayoutSize[],
  options: GridLayoutOptions = {}
): readonly Rect[] {
  const contentBounds = layoutContentBounds(bounds, options);
  const rowRects = splitTracks(contentBounds, 'vertical', rows, gapOptions(options.rowGap ?? options.gap));
  const columnRects = splitTracks(contentBounds, 'horizontal', columns, gapOptions(options.columnGap ?? options.gap));
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

function resolveTrackSizes(
  total: number,
  tracks: readonly LayoutSize[],
  contentSizes: readonly number[]
): readonly number[] {
  if (tracks.length === 0) return [];
  const safeTotal = Math.max(0, Math.floor(total));
  const fixed = tracks.map((track) => track.kind === 'fixed' ? Math.max(0, Math.floor(track.cells)) : 0);
  const percent = tracks.map((track) => track.kind === 'percent'
    ? Math.max(0, Math.floor(safeTotal * Math.max(0, track.value) / 100))
    : 0);
  const content = tracks.map((track, index) => track.kind === 'content'
    ? measuredContentTrackSize(track, contentSizes[index])
    : 0);
  const claimed = fixed.reduce((sum, value) => sum + value, 0)
    + percent.reduce((sum, value) => sum + value, 0)
    + content.reduce((sum, value) => sum + value, 0);
  const fillTracks = tracks.map((track) => track.kind === 'fill' ? Math.max(1, Math.floor(track.weight ?? 1)) : 0);
  const fillWeight = fillTracks.reduce((sum, value) => sum + value, 0);
  const remaining = Math.max(0, safeTotal - claimed);
  const sizes = tracks.map((track, index) => {
    if (track.kind === 'fixed') return fixed[index] ?? 0;
    if (track.kind === 'percent') return percent[index] ?? 0;
    if (track.kind === 'content') return content[index] ?? 0;
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

function measuredContentTrackSize(track: Extract<LayoutSize, { readonly kind: 'content' }>, measured: number | undefined): number {
  const min = Math.max(0, Math.floor(track.min ?? 0));
  const preferred = measured === undefined || !Number.isFinite(measured) ? min : Math.max(min, Math.floor(measured));
  if (track.max === undefined) return preferred;
  return Math.min(preferred, Math.max(min, Math.floor(track.max)));
}

export function layoutContentBounds(bounds: Rect, options: LayoutFlowOptions = {}): Rect {
  return constrainRect(insetRect(insetRect(bounds, normalizeInsets(options.margin)), normalizeInsets(options.padding)), options);
}

function insetRect(bounds: Rect, inset: LayoutInsets): Rect {
  return clampRect({
    row: bounds.row + inset.top,
    column: bounds.column + inset.left,
    width: bounds.width - inset.left - inset.right,
    height: bounds.height - inset.top - inset.bottom
  });
}

function constrainRect(bounds: Rect, options: LayoutFlowOptions): Rect {
  const minWidth = nonNegativeInteger(options.minWidth);
  const minHeight = nonNegativeInteger(options.minHeight);
  const maxWidth = options.maxWidth === undefined
    ? options.overflow === 'visible' ? Number.POSITIVE_INFINITY : bounds.width
    : nonNegativeInteger(options.maxWidth);
  const maxHeight = options.maxHeight === undefined
    ? options.overflow === 'visible' ? Number.POSITIVE_INFINITY : bounds.height
    : nonNegativeInteger(options.maxHeight);
  const targetWidth = Math.min(Math.max(bounds.width, minWidth), maxWidth);
  const targetHeight = Math.min(Math.max(bounds.height, minHeight), maxHeight);
  const width = options.overflow === 'visible' ? targetWidth : Math.min(targetWidth, bounds.width);
  const height = options.overflow === 'visible' ? targetHeight : Math.min(targetHeight, bounds.height);
  return clampRect({
    row: alignedStart(bounds.row, bounds.height, height, options.justify ?? 'stretch'),
    column: alignedStart(bounds.column, bounds.width, width, options.align ?? 'stretch'),
    width,
    height
  });
}

function alignedStart(start: number, available: number, size: number, alignment: LayoutAlignment | LayoutJustification): number {
  if (alignment === 'center') return start + Math.floor((available - size) / 2);
  if (alignment === 'end') return start + available - size;
  return start;
}

function normalizeInsets(input: LayoutInsetInput | undefined): LayoutInsets {
  if (typeof input === 'number') {
    const value = nonNegativeInteger(input);
    return { top: value, right: value, bottom: value, left: value };
  }
  if (input === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    top: nonNegativeInteger(input.top),
    right: nonNegativeInteger(input.right),
    bottom: nonNegativeInteger(input.bottom),
    left: nonNegativeInteger(input.left)
  };
}

function normalizedGap(value: number | undefined): number {
  return nonNegativeInteger(value);
}

function gapOptions(value: number | undefined): LayoutFlowOptions {
  return value === undefined ? {} : { gap: value };
}

function nonNegativeInteger(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
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
