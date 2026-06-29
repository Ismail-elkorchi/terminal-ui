import type { Rect } from '../layout.ts';
import type { CanvasPoint } from './paths.ts';

export function rectInteriorPoints(bounds: Rect): readonly CanvasPoint[] {
  const normalized = normalizeRect(bounds);
  const points: CanvasPoint[] = [];
  for (let y = normalized.y; y < normalized.y + normalized.height; y += 1) {
    for (let x = normalized.x; x < normalized.x + normalized.width; x += 1) {
      points.push({ x, y });
    }
  }
  return points;
}

export function rectStrokePoints(bounds: Rect): readonly CanvasPoint[] {
  const normalized = normalizeRect(bounds);
  const points: CanvasPoint[] = [];
  if (normalized.width === 0 || normalized.height === 0) return points;
  const lastX = normalized.x + normalized.width - 1;
  const lastY = normalized.y + normalized.height - 1;
  for (let x = normalized.x; x <= lastX; x += 1) {
    points.push({ x, y: normalized.y });
    if (lastY !== normalized.y) points.push({ x, y: lastY });
  }
  for (let y = normalized.y + 1; y < lastY; y += 1) {
    points.push({ x: normalized.x, y });
    if (lastX !== normalized.x) points.push({ x: lastX, y });
  }
  return points;
}

function normalizeRect(bounds: Rect): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return {
    x: Math.floor(bounds.column),
    y: Math.floor(bounds.row),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height))
  };
}
