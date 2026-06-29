import type { RenderSpan } from '../render-primitives.ts';
import type { CanvasPoint } from './paths.ts';

export interface AxisLine {
  readonly points: readonly CanvasPoint[];
  readonly tickPoints: readonly CanvasPoint[];
  readonly glyph: RenderSpan;
}

export function horizontalAxis(length: number, y: number, glyph: RenderSpan, tickEvery = 0): AxisLine {
  const safeLength = Math.max(0, Math.floor(length));
  const points = Array.from({ length: safeLength }, (_value, x) => ({ x, y: Math.floor(y) }));
  return {
    points,
    tickPoints: tickPoints(points, Math.floor(tickEvery)),
    glyph
  };
}

export function verticalAxis(length: number, x: number, glyph: RenderSpan, tickEvery = 0): AxisLine {
  const safeLength = Math.max(0, Math.floor(length));
  const points = Array.from({ length: safeLength }, (_value, y) => ({ x: Math.floor(x), y }));
  return {
    points,
    tickPoints: tickPoints(points, Math.floor(tickEvery)),
    glyph
  };
}

function tickPoints(points: readonly CanvasPoint[], tickEvery: number): readonly CanvasPoint[] {
  if (tickEvery <= 0) return [];
  return points.filter((_point, index) => index % tickEvery === 0);
}
