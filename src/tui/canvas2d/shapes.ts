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

export function ellipseStrokePoints(
  center: CanvasPoint,
  radiusX: number,
  radiusY: number,
  startAngle = 0,
  endAngle = Math.PI * 2
): readonly CanvasPoint[] {
  const rx = Math.abs(radiusX);
  const ry = Math.abs(radiusY);
  if (rx === 0 && ry === 0) return [integerPoint(center.x, center.y)];
  const span = normalizeAngleSpan(startAngle, endAngle);
  const steps = Math.max(12, Math.ceil(Math.max(rx, ry) * Math.abs(span) * 2));
  const points: CanvasPoint[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = startAngle + (span * step) / steps;
    points.push(integerPoint(center.x + Math.cos(angle) * rx, center.y + Math.sin(angle) * ry));
  }
  return uniquePoints(points);
}

export function ellipseInteriorPoints(center: CanvasPoint, radiusX: number, radiusY: number): readonly CanvasPoint[] {
  const rx = Math.abs(radiusX);
  const ry = Math.abs(radiusY);
  if (rx === 0 && ry === 0) return [integerPoint(center.x, center.y)];
  const points: CanvasPoint[] = [];
  const minX = Math.floor(center.x - rx);
  const maxX = Math.ceil(center.x + rx);
  const minY = Math.floor(center.y - ry);
  const maxY = Math.ceil(center.y + ry);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const normalizedX = rx === 0 ? 0 : (x - center.x) / rx;
      const normalizedY = ry === 0 ? 0 : (y - center.y) / ry;
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) points.push({ x, y });
    }
  }
  return points;
}

export function polygonInteriorPoints(points: readonly CanvasPoint[]): readonly CanvasPoint[] {
  if (points.length < 3) return [];
  const bounds = pointBounds(points);
  const filled: CanvasPoint[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (pointInPolygon({ x, y }, points)) filled.push({ x, y });
    }
  }
  return filled;
}

function normalizeRect(bounds: Rect): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return {
    x: Math.floor(bounds.column),
    y: Math.floor(bounds.row),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height))
  };
}

function integerPoint(x: number, y: number): CanvasPoint {
  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

function normalizeAngleSpan(startAngle: number, endAngle: number): number {
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return Math.PI * 2;
  const span = endAngle - startAngle;
  if (span === 0) return Math.PI * 2;
  return span;
}

function uniquePoints(points: readonly CanvasPoint[]): readonly CanvasPoint[] {
  const seen = new Set<string>();
  const unique: CanvasPoint[] = [];
  for (const point of points) {
    const key = `${String(point.x)}:${String(point.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
}

function pointBounds(points: readonly CanvasPoint[]): {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
} {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, Math.floor(point.x)),
    maxX: Math.max(bounds.maxX, Math.ceil(point.x)),
    minY: Math.min(bounds.minY, Math.floor(point.y)),
    maxY: Math.max(bounds.maxY, Math.ceil(point.y))
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });
}

function pointInPolygon(point: CanvasPoint, polygon: readonly CanvasPoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    if (currentPoint === undefined || previousPoint === undefined) continue;
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
