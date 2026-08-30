import type {
  GridLayoutOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutInsets,
  LayoutJustification,
  LayoutSize,
  Rect
} from './types.ts';
import { finiteNonNegativeIntegerOrZero } from '../foundation/validation.ts';

export function splitTracks(
  bounds: Rect,
  orientation: 'horizontal' | 'vertical',
  tracks: readonly LayoutSize[],
  options: LayoutFlowOptions = {},
  contentSizes: readonly number[] = []
): readonly Rect[] {
  const contentBounds = layoutContentBounds(bounds, options);
  const totalDimension = orientation === 'horizontal' ? contentBounds.width : contentBounds.height;
  const gap = resolveGapSizes(totalDimension, tracks, normalizedGap(options.gap), contentSizes);
  const sizes = resolveTrackSizes(totalDimension - gap.reduce((sum, value) => sum + value, 0), tracks, contentSizes);
  let row = contentBounds.row;
  let column = contentBounds.column;
  return sizes.map((size, index) => {
    const rect = orientation === 'horizontal'
      ? { row: contentBounds.row, column, width: size, height: contentBounds.height }
      : { row, column: contentBounds.column, width: contentBounds.width, height: size };
    const nextGap = gap[index] ?? 0;
    if (orientation === 'horizontal') column += size + nextGap;
    else row += size + nextGap;
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

function resolveTrackSizes(
  total: number,
  tracks: readonly LayoutSize[],
  contentSizes: readonly number[]
): readonly number[] {
  if (tracks.length === 0) return [];
  const safeTotal = Math.max(0, Math.floor(total));
  const fixed = tracks.map((track) => track.kind === 'fixed' ? Math.max(0, Math.floor(track.cells)) : 0);
  const percent = percentTrackSizes(safeTotal, tracks);
  const content = tracks.map((track, index) => track.kind === 'content'
    ? measuredContentTrackSize(track, contentSizes[index])
    : 0);
  const claimed = fixed.reduce((sum, value) => sum + value, 0)
    + percent.reduce((sum, value) => sum + value, 0)
    + content.reduce((sum, value) => sum + value, 0);
  const fillTracks = tracks.map((track) => track.kind === 'fill' ? Math.max(1, Math.floor(track.weight ?? 1)) : 0);
  const remaining = Math.max(0, safeTotal - claimed);
  const fillSizes = weightedFillSizes(remaining, fillTracks);
  const sizes = tracks.map((track, index) => {
    if (track.kind === 'fixed') return fixed[index] ?? 0;
    if (track.kind === 'percent') return percent[index] ?? 0;
    if (track.kind === 'content') return content[index] ?? 0;
    return fillSizes[index] ?? 0;
  });
  return sizes.reduce((sum, value) => sum + value, 0) > safeTotal ? fitSizes(sizes, safeTotal) : sizes;
}

function percentTrackSizes(total: number, tracks: readonly LayoutSize[]): readonly number[] {
  const entries = tracks.map((track, index) => {
    const exact = track.kind === 'percent'
      ? total * Math.max(0, track.value) / 100
      : 0;
    const floor = Math.floor(exact);
    return { index, exact, floor, fraction: exact - floor };
  });
  const requestedPercent = tracks.reduce(
    (sum, track) => sum + (track.kind === 'percent' ? Math.max(0, track.value) : 0),
    0,
  );
  const exactTarget = total * Math.min(100, requestedPercent) / 100;
  const nearestTarget = Math.round(exactTarget);
  const target = Math.min(
    total,
    Math.abs(exactTarget - nearestTarget) < 1e-9 ? nearestTarget : Math.floor(exactTarget),
  );
  const sizes = entries.map((entry) => entry.floor);
  let remaining = target - sizes.reduce((sum, size) => sum + size, 0);
  const remainderOrder = entries
    .filter((entry) => tracks[entry.index]?.kind === 'percent')
    .sort((left, right) => right.fraction - left.fraction || right.index - left.index);
  for (const entry of remainderOrder) {
    if (remaining <= 0) break;
    sizes[entry.index] = (sizes[entry.index] ?? 0) + 1;
    remaining -= 1;
  }
  return sizes;
}

function resolveGapSizes(
  totalDimension: number,
  tracks: readonly LayoutSize[],
  requestedGap: number,
  contentSizes: readonly number[]
): readonly number[] {
  const gapCount = Math.max(0, tracks.length - 1);
  if (gapCount === 0 || requestedGap === 0) return Array.from({ length: gapCount }, () => 0);
  const safeTotal = Math.max(0, Math.floor(totalDimension));
  const requestedGapTotal = requestedGap * gapCount;
  const idealContentTotal = Math.max(0, safeTotal - requestedGapTotal);
  const idealNonFillClaim = nonFillTrackClaim(idealContentTotal, tracks, contentSizes);
  if (idealNonFillClaim <= idealContentTotal) {
    return Array.from({ length: gapCount }, () => requestedGap);
  }
  const maximumGapTotal = Math.max(0, safeTotal - nonFillTrackClaim(safeTotal, tracks, contentSizes));
  return distributeGapCells(Math.min(requestedGapTotal, maximumGapTotal), gapCount, requestedGap);
}

function nonFillTrackClaim(
  total: number,
  tracks: readonly LayoutSize[],
  contentSizes: readonly number[]
): number {
  const safeTotal = Math.max(0, Math.floor(total));
  const percent = percentTrackSizes(safeTotal, tracks);
  return tracks.reduce((sum, track, index) => {
    if (track.kind === 'fixed') return sum + Math.max(0, Math.floor(track.cells));
    if (track.kind === 'percent') return sum + (percent[index] ?? 0);
    if (track.kind === 'content') return sum + measuredContentTrackSize(track, contentSizes[index]);
    return sum;
  }, 0);
}

function distributeGapCells(totalGap: number, gapCount: number, requestedGap: number): readonly number[] {
  let remaining = Math.max(0, Math.floor(totalGap));
  return Array.from({ length: gapCount }, () => {
    const size = Math.min(requestedGap, remaining);
    remaining -= size;
    return size;
  });
}

function weightedFillSizes(total: number, weights: readonly number[]): readonly number[] {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (safeTotal === 0 || totalWeight === 0) return weights.map(() => 0);
  const shares = weights.map((weight, index) => {
    if (weight <= 0) return { index, weight, floor: 0, fraction: 0 };
    const exact = safeTotal * weight / totalWeight;
    return {
      index,
      weight,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact)
    };
  });
  const sizes = shares.map((share) => share.floor);
  let remaining = safeTotal - sizes.reduce((sum, value) => sum + value, 0);
  const remainderOrder = [...shares]
    .filter((share) => share.weight > 0)
    .sort((left, right) =>
      right.fraction - left.fraction
      || right.weight - left.weight
      || right.index - left.index
    );
  for (const share of remainderOrder) {
    if (remaining <= 0) break;
    sizes[share.index] = (sizes[share.index] ?? 0) + 1;
    remaining -= 1;
  }
  return sizes;
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

export function layoutBoxBounds(bounds: Rect, options: LayoutFlowOptions = {}): Rect {
  return constrainRect(insetRect(bounds, normalizeInsets(options.margin)), options);
}

export function layoutPaddingBounds(bounds: Rect, padding: LayoutInsetInput | undefined): Rect {
  return insetRect(bounds, normalizeInsets(padding));
}

export function layoutMarginBounds(bounds: Rect, margin: LayoutInsetInput | undefined): Rect {
  return insetRect(bounds, normalizeInsets(margin));
}

export function layoutInsetSize(input: LayoutInsetInput | undefined): {
  readonly width: number;
  readonly height: number;
} {
  const inset = normalizeInsets(input);
  return {
    width: inset.left + inset.right,
    height: inset.top + inset.bottom
  };
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
  const minWidth = finiteNonNegativeIntegerOrZero(options.minWidth);
  const minHeight = finiteNonNegativeIntegerOrZero(options.minHeight);
  const maxWidth = options.maxWidth === undefined
    ? options.overflow === 'visible' ? Number.POSITIVE_INFINITY : bounds.width
    : finiteNonNegativeIntegerOrZero(options.maxWidth);
  const maxHeight = options.maxHeight === undefined
    ? options.overflow === 'visible' ? Number.POSITIVE_INFINITY : bounds.height
    : finiteNonNegativeIntegerOrZero(options.maxHeight);
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
    const value = finiteNonNegativeIntegerOrZero(input);
    return { top: value, right: value, bottom: value, left: value };
  }
  if (input === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    top: finiteNonNegativeIntegerOrZero(input.top),
    right: finiteNonNegativeIntegerOrZero(input.right),
    bottom: finiteNonNegativeIntegerOrZero(input.bottom),
    left: finiteNonNegativeIntegerOrZero(input.left)
  };
}

function normalizedGap(value: number | undefined): number {
  return finiteNonNegativeIntegerOrZero(value);
}

function gapOptions(value: number | undefined): LayoutFlowOptions {
  return value === undefined ? {} : { gap: value };
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
    row: Math.max(0, bounds.row),
    column: Math.max(0, bounds.column),
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height)
  };
}
