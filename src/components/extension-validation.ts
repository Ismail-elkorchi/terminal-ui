import type { CanvasPainter } from './options/drawing.ts';

export function assertCanvasPainter(value: unknown): asserts value is CanvasPainter {
  if (typeof value !== 'function') {
    throw new Error('canvas() requires a painter function.');
  }
}
