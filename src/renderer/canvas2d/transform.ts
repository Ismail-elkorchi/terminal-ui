import type { CanvasPoint, CanvasTransform, CanvasTransformInput } from '../contracts.ts';

export type { CanvasTransform, CanvasTransformInput } from '../contracts.ts';

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
  const composed = {
    translateX: current.translateX + normalized.translateX * current.scaleX,
    translateY: current.translateY + normalized.translateY * current.scaleY,
    scaleX: current.scaleX * normalized.scaleX,
    scaleY: current.scaleY * normalized.scaleY
  };
  assertIntegerTransform(composed);
  return composed;
}

export function transformCanvasPoint(transform: CanvasTransform, point: CanvasPoint): CanvasPoint {
  assertIntegerTransform(transform);
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
    throw new RangeError('Canvas transform point coordinates must be safe integers.');
  }
  const result = {
    x: point.x * transform.scaleX + transform.translateX,
    y: point.y * transform.scaleY + transform.translateY
  };
  if (!Number.isSafeInteger(result.x) || !Number.isSafeInteger(result.y)) {
    throw new RangeError('Canvas transform point exceeds safe integer coordinates.');
  }
  return result;
}

export function transformCanvasRect(
  transform: CanvasTransform,
  bounds: CanvasPoint & { readonly width: number; readonly height: number }
): CanvasPoint & { readonly width: number; readonly height: number } {
  if (
    !Number.isSafeInteger(bounds.width)
    || !Number.isSafeInteger(bounds.height)
    || bounds.width < 0
    || bounds.height < 0
  ) {
    throw new RangeError('Canvas transform rectangle dimensions must be non-negative integers.');
  }
  const start = transformCanvasPoint(transform, bounds);
  const width = bounds.width * Math.abs(transform.scaleX);
  const height = bounds.height * Math.abs(transform.scaleY);
  const result = {
    x: start.x + (transform.scaleX < 0 && width > 0 ? 1 - width : 0),
    y: start.y + (transform.scaleY < 0 && height > 0 ? 1 - height : 0),
    width,
    height,
  };
  if (!Object.values(result).every(Number.isSafeInteger)) {
    throw new RangeError('Canvas transform rectangle exceeds safe integer coordinates.');
  }
  return result;
}

function integer(
  value: number | undefined,
  fallback: number,
  name: string,
  allowZero: boolean
): number {
  if (value === undefined) return fallback;
  if (Number.isSafeInteger(value) && (allowZero || value !== 0)) return value;
  throw new RangeError(
    `Canvas transform ${name} must be ${allowZero ? 'an integer' : 'a non-zero integer'}.`
  );
}

function assertIntegerTransform(transform: CanvasTransform): void {
  if (
    Number.isSafeInteger(transform.translateX)
    && Number.isSafeInteger(transform.translateY)
    && Number.isSafeInteger(transform.scaleX)
    && Number.isSafeInteger(transform.scaleY)
    && transform.scaleX !== 0
    && transform.scaleY !== 0
  ) {
    return;
  }
  throw new RangeError('Canvas transform values must use integer translation and non-zero integer scale.');
}
