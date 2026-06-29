export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export function linePoints(x1: number, y1: number, x2: number, y2: number): readonly CanvasPoint[] {
  const start = integerPoint(x1, y1);
  const end = integerPoint(x2, y2);
  const points: CanvasPoint[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const sx = start.x < end.x ? 1 : -1;
  const sy = start.y < end.y ? 1 : -1;
  let error = dx - dy;

  points.push({ x, y });
  while (x !== end.x || y !== end.y) {
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
    points.push({ x, y });
  }

  return points;
}

export function integerPoint(x: number, y: number): CanvasPoint {
  return {
    x: Math.floor(x),
    y: Math.floor(y)
  };
}
