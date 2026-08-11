import type { Rect } from '../geometry/types.ts';
import {
  assertFiniteNumber,
  assertOptionalEnum,
  assertOptionalFiniteNumber,
  finiteNonNegativeIntegerOrZero,
  isNonArrayObject,
  isStringMember
} from '../foundation/validation.ts';

const anchoredSurfaceSides = ['above', 'below', 'left', 'right'] as const;
const anchoredSurfacePlacements = [...anchoredSurfaceSides, 'auto', 'cursor'] as const;

export type AnchoredSurfaceSide = 'above' | 'below' | 'left' | 'right';

export type AnchoredSurfacePlacement = AnchoredSurfaceSide | 'auto' | 'cursor';
export type AnchoredSurfaceFit = 'viewport' | 'available';

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
  readonly fit?: AnchoredSurfaceFit;
}

export function placeAnchoredSurface(input: PlaceAnchoredSurfaceInput): Rect {
  assertAnchoredSurfaceOptions(input, 'placeAnchoredSurface()');
  assertRect(input.viewport, 'placeAnchoredSurface() viewport');
  assertSize(input.size, 'placeAnchoredSurface() size');
  return placeAnchoredSurfaceFromValidatedInput(input);
}

export function placeAnchoredSurfaceFromValidatedInput(input: PlaceAnchoredSurfaceInput): Rect {
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

  if (input.fit === 'available') {
    for (const candidate of candidates) {
      const rect = availableRectForSide(viewport, anchor, size, candidate, margin);
      if (rect.width > 0 && rect.height > 0) return rect;
    }
  }

  return clampRect(rectForSide(anchor, size, candidates[0] ?? 'below', margin), viewport);
}

export function assertAnchoredSurfaceOptions(
  input: {
    readonly anchor: unknown;
    readonly placement?: unknown;
    readonly fallback?: unknown;
    readonly margin?: unknown;
    readonly fit?: unknown;
  },
  label: string
): void {
  assertAnchor(input.anchor, `${label} anchor`);
  assertOptionalEnum(input.placement, anchoredSurfacePlacements, `${label} placement`);
  assertOptionalEnum(input.fit, ['viewport', 'available'], `${label} fit`);
  if (input.fallback !== undefined
    && (!Array.isArray(input.fallback)
      || input.fallback.some((side) => !isStringMember(side, anchoredSurfaceSides)))) {
    throw new TypeError(`${label} fallback must contain only above, below, left, or right.`);
  }
  assertOptionalFiniteNumber(input.margin, `${label} margin`);
  if (typeof input.margin === 'number' && input.margin < 0) {
    throw new RangeError(`${label} margin must be non-negative.`);
  }
}

function availableRectForSide(
  viewport: Rect,
  target: Rect,
  size: AnchoredSurfaceSize,
  side: AnchoredSurfaceSide,
  margin: number
): Rect {
  const viewportBottom = viewport.row + viewport.height;
  const viewportRight = viewport.column + viewport.width;
  if (side === 'below') {
    const row = target.row + target.height + margin;
    return {
      row,
      column: clampStart(target.column, size.width, viewport.column, viewportRight),
      width: size.width,
      height: Math.min(size.height, Math.max(0, viewportBottom - row))
    };
  }
  if (side === 'above') {
    const bottom = target.row - margin;
    const height = Math.min(size.height, Math.max(0, bottom - viewport.row));
    return {
      row: bottom - height,
      column: clampStart(target.column, size.width, viewport.column, viewportRight),
      width: size.width,
      height
    };
  }
  if (side === 'right') {
    const column = target.column + target.width + margin;
    return {
      row: clampStart(target.row, size.height, viewport.row, viewportBottom),
      column,
      width: Math.min(size.width, Math.max(0, viewportRight - column)),
      height: size.height
    };
  }
  const right = target.column - margin;
  const width = Math.min(size.width, Math.max(0, right - viewport.column));
  return {
    row: clampStart(target.row, size.height, viewport.row, viewportBottom),
    column: right - width,
    width,
    height: size.height
  };
}

function clampStart(value: number, extent: number, minimum: number, end: number): number {
  return Math.min(Math.max(value, minimum), end - extent);
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

function assertAnchor(value: unknown, label: string): void {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${label} must be a target or cursor anchor.`);
  }
  if (value['kind'] === 'target') {
    assertRect(value['bounds'], `${label} bounds`);
    return;
  }
  if (value['kind'] === 'cursor') {
    assertFiniteNumber(value['row'], `${label} row`);
    assertFiniteNumber(value['column'], `${label} column`);
    return;
  }
  throw new TypeError(`${label} kind must be target or cursor.`);
}

function assertRect(value: unknown, label: string): void {
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be a rectangle.`);
  assertFiniteNumber(value['row'], `${label} row`);
  assertFiniteNumber(value['column'], `${label} column`);
  assertFiniteNumber(value['width'], `${label} width`);
  assertFiniteNumber(value['height'], `${label} height`);
  if (value['width'] < 0 || value['height'] < 0) {
    throw new RangeError(`${label} width and height must be non-negative.`);
  }
}

function assertSize(value: unknown, label: string): void {
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  assertFiniteNumber(value['width'], `${label} width`);
  assertFiniteNumber(value['height'], `${label} height`);
  if (value['width'] < 0 || value['height'] < 0) {
    throw new RangeError(`${label} width and height must be non-negative.`);
  }
}
