import type { Rect } from '../layout.ts';
import type { CanvasPoint } from './paths.ts';

export interface CanvasTransform {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CanvasTransformInput {
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
}

export const identityCanvasTransform: CanvasTransform = Object.freeze({
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1
});

export function canvasTransform(input: CanvasTransformInput = {}): CanvasTransform {
  return {
    translateX: finite(input.translateX, 0),
    translateY: finite(input.translateY, 0),
    scaleX: finite(input.scaleX, 1),
    scaleY: finite(input.scaleY, 1)
  };
}

export function composeCanvasTransform(
  current: CanvasTransform,
  next: CanvasTransformInput
): CanvasTransform {
  const normalized = canvasTransform(next);
  return {
    translateX: current.translateX + normalized.translateX * current.scaleX,
    translateY: current.translateY + normalized.translateY * current.scaleY,
    scaleX: current.scaleX * normalized.scaleX,
    scaleY: current.scaleY * normalized.scaleY
  };
}

export function transformCanvasPoint(transform: CanvasTransform, point: CanvasPoint): CanvasPoint {
  return {
    x: point.x * transform.scaleX + transform.translateX,
    y: point.y * transform.scaleY + transform.translateY
  };
}

export function transformCanvasRect(transform: CanvasTransform, bounds: Rect): Rect {
  const start = transformCanvasPoint(transform, { x: bounds.column, y: bounds.row });
  return {
    row: start.y,
    column: start.x,
    width: Math.max(0, bounds.width * Math.abs(transform.scaleX)),
    height: Math.max(0, bounds.height * Math.abs(transform.scaleY))
  };
}

function finite(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}
