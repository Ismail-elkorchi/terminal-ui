import type { Rect } from '../geometry/types.ts';
import { finiteNonNegativeIntegerOrZero } from '../foundation/validation.ts';

export type AnchoredSurfaceSide = 'above' | 'below' | 'left' | 'right';

export type AnchoredSurfacePlacement = AnchoredSurfaceSide | 'auto' | 'cursor';

export type AnchoredSurfaceAnchor =
  | { readonly kind: 'target'; readonly bounds: Rect }
  | { readonly kind: 'cursor'; readonly row: number; readonly column: number };

export type AnchoredSurfaceDismissReason =
  | 'escape'
  | 'outsidePress'
  | 'focusLoss'
  | 'programmatic';

export interface AnchoredSurfaceSize {
  readonly width: number;
  readonly height: number;
}

export interface PlaceAnchoredSurfaceInput {
  readonly viewport: Rect;
  readonly anchor: AnchoredSurfaceAnchor;
  readonly size: AnchoredSurfaceSize;
  readonly placement?: AnchoredSurfacePlacement;
  readonly fallback?: readonly AnchoredSurfaceSide[];
  readonly margin?: number;
}

export function placeAnchoredSurface(input: PlaceAnchoredSurfaceInput): Rect {
  const viewport = normalizeRect(input.viewport);
  const size = boundedSize(input.size, viewport);
  const margin = finiteNonNegativeIntegerOrZero(input.margin ?? 1);
  const anchor = anchorBounds(input.anchor);
  const placement = input.placement ?? (input.anchor.kind === 'cursor' ? 'cursor' : 'auto');
  const candidates = candidateOrder(placement, input.fallback);

  for (const candidate of candidates) {
    const rect = rectForSide(anchor, size, candidate, margin);
    if (containsRect(viewport, rect)) return rect;
  }

  return clampRect(rectForSide(anchor, size, candidates[0] ?? 'below', margin), viewport);
}

function candidateOrder(
  placement: AnchoredSurfacePlacement,
  fallback: readonly AnchoredSurfaceSide[] | undefined
): readonly AnchoredSurfaceSide[] {
  const preferred = preferredSides(placement);
  if (fallback === undefined) return preferred;
  return uniqueSides([...preferred.slice(0, 1), ...fallback, ...preferred]);
}

function preferredSides(placement: AnchoredSurfacePlacement): readonly AnchoredSurfaceSide[] {
  if (placement === 'above') return ['above', 'below', 'right', 'left'];
  if (placement === 'below' || placement === 'cursor') return ['below', 'above', 'right', 'left'];
  if (placement === 'left') return ['left', 'right', 'below', 'above'];
  if (placement === 'right') return ['right', 'left', 'below', 'above'];
  return ['below', 'above', 'right', 'left'];
}

function uniqueSides(sides: readonly AnchoredSurfaceSide[]): readonly AnchoredSurfaceSide[] {
  return sides.filter((side, index) => sides.indexOf(side) === index);
}

function anchorBounds(anchor: AnchoredSurfaceAnchor): Rect {
  return anchor.kind === 'target'
    ? normalizeRect(anchor.bounds)
    : { row: Math.floor(anchor.row), column: Math.floor(anchor.column), width: 1, height: 1 };
}

function rectForSide(
  target: Rect,
  size: AnchoredSurfaceSize,
  side: AnchoredSurfaceSide,
  margin: number
): Rect {
  if (side === 'above') {
    return {
      row: target.row - size.height - margin,
      column: target.column,
      width: size.width,
      height: size.height
    };
  }
  if (side === 'left') {
    return {
      row: target.row,
      column: target.column - size.width - margin,
      width: size.width,
      height: size.height
    };
  }
  if (side === 'right') {
    return {
      row: target.row,
      column: target.column + target.width + margin,
      width: size.width,
      height: size.height
    };
  }
  return {
    row: target.row + target.height + margin,
    column: target.column,
    width: size.width,
    height: size.height
  };
}

function clampRect(rect: Rect, viewport: Rect): Rect {
  return {
    row: Math.min(Math.max(rect.row, viewport.row), viewport.row + viewport.height - rect.height),
    column: Math.min(Math.max(rect.column, viewport.column), viewport.column + viewport.width - rect.width),
    width: rect.width,
    height: rect.height
  };
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return inner.row >= outer.row
    && inner.column >= outer.column
    && inner.row + inner.height <= outer.row + outer.height
    && inner.column + inner.width <= outer.column + outer.width;
}

function boundedSize(size: AnchoredSurfaceSize, viewport: Rect): AnchoredSurfaceSize {
  return {
    width: Math.min(finiteNonNegativeIntegerOrZero(size.width), viewport.width),
    height: Math.min(finiteNonNegativeIntegerOrZero(size.height), viewport.height)
  };
}

function normalizeRect(rect: Rect): Rect {
  return {
    row: Math.floor(rect.row),
    column: Math.floor(rect.column),
    width: finiteNonNegativeIntegerOrZero(rect.width),
    height: finiteNonNegativeIntegerOrZero(rect.height)
  };
}
