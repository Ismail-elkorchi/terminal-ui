import type { CanvasPoint, CanvasTransform, CanvasTransformInput } from '../../model/canvas2d.ts';

export type { CanvasTransform, CanvasTransformInput } from '../../model/canvas2d.ts';

export const identityCanvasTransform: CanvasTransform = Object.freeze({
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1
});

export function canvasTransform(input: CanvasTransformInput = {}): CanvasTransform {
  return {
    translateX: integer(input.translateX, 0, 'translateX', true),
    translateY: integer(input.translateY, 0, 'translateY', true),
    scaleX: integer(input.scaleX, 1, 'scaleX', false),
    scaleY: integer(input.scaleY, 1, 'scaleY', false)
  };
}

export function composeCanvasTransform(
  current: CanvasTransform,
  next: CanvasTransformInput
): CanvasTransform {
  assertIntegerTransform(current);
  const normalized = canvasTransform(next);
  return {
    translateX: current.translateX + normalized.translateX * current.scaleX,
    translateY: current.translateY + normalized.translateY * current.scaleY,
    scaleX: current.scaleX * normalized.scaleX,
    scaleY: current.scaleY * normalized.scaleY
  };
}

export function transformCanvasPoint(transform: CanvasTransform, point: CanvasPoint): CanvasPoint {
  assertIntegerTransform(transform);
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    throw new RangeError('Canvas transform point coordinates must be finite integers.');
  }
  return {
    x: point.x * transform.scaleX + transform.translateX,
    y: point.y * transform.scaleY + transform.translateY
  };
}

export function transformCanvasRect(
  transform: CanvasTransform,
  bounds: CanvasPoint & { readonly width: number; readonly height: number }
): CanvasPoint & { readonly width: number; readonly height: number } {
  if (
    !Number.isInteger(bounds.width)
    || !Number.isInteger(bounds.height)
    || bounds.width < 0
    || bounds.height < 0
  ) {
    throw new RangeError('Canvas transform rectangle dimensions must be non-negative integers.');
  }
  const start = transformCanvasPoint(transform, bounds);
  return {
    x: start.x,
    y: start.y,
    width: Math.max(0, bounds.width * Math.abs(transform.scaleX)),
    height: Math.max(0, bounds.height * Math.abs(transform.scaleY))
  };
}

function integer(
  value: number | undefined,
  fallback: number,
  name: string,
  allowZero: boolean
): number {
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && (allowZero || value !== 0)) return value;
  throw new RangeError(
    `Canvas transform ${name} must be ${allowZero ? 'an integer' : 'a non-zero integer'}.`
  );
}

function assertIntegerTransform(transform: CanvasTransform): void {
  if (
    Number.isInteger(transform.translateX)
    && Number.isInteger(transform.translateY)
    && Number.isInteger(transform.scaleX)
    && Number.isInteger(transform.scaleY)
    && transform.scaleX !== 0
    && transform.scaleY !== 0
  ) {
    return;
  }
  throw new RangeError('Canvas transform values must use integer translation and non-zero integer scale.');
}
