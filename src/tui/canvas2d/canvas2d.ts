import { brailleCellForPoint, brailleCharacter } from './braille.ts';
import { linePoints } from './paths.ts';
import {
  ellipseInteriorPoints,
  ellipseStrokePoints,
  polygonInteriorPoints,
  rectInteriorPoints,
  rectStrokePoints
} from './shapes.ts';
import {
  composeCanvasTransform,
  identityCanvasTransform,
  transformCanvasPoint,
  transformCanvasRect
} from './transform.ts';
import type { FrameBuffer } from '../frame.ts';
import type { Rect } from '../layout.ts';
import type { RenderSpan, TerminalStyle } from '../render-primitives.ts';
import type { CanvasPoint } from './paths.ts';
import type { CanvasTransform, CanvasTransformInput } from './transform.ts';
import { clipRenderSpans } from '../render-primitives.ts';

export interface StrokeFillOptions {
  readonly stroke?: RenderSpan;
  readonly fill?: RenderSpan;
}

export interface Canvas2D {
  readonly bounds: Rect;
  point(x: number, y: number, span: RenderSpan): void;
  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void;
  polyline(points: readonly CanvasPoint[], span: RenderSpan): void;
  rect(bounds: Rect, options: StrokeFillOptions): void;
  circle(center: CanvasPoint, radius: number, options: StrokeFillOptions): void;
  ellipse(center: CanvasPoint, radiusX: number, radiusY: number, options: StrokeFillOptions): void;
  arc(center: CanvasPoint, radius: number, startAngle: number, endAngle: number, options: StrokeFillOptions): void;
  fillPolygon(points: readonly CanvasPoint[], span: RenderSpan): void;
  text(x: number, y: number, spans: readonly RenderSpan[]): void;
  braillePoint(x: number, y: number, style?: TerminalStyle): void;
  clear(bounds?: Rect): void;
  translate(dx: number, dy: number): void;
  scale(x: number, y: number): void;
  withTransform(transform: CanvasTransformInput, draw: (canvas: Canvas2D) => void): void;
}

export function createCanvas2D(buffer: FrameBuffer, bounds: Rect): Canvas2D {
  return new FrameBufferCanvas2D(buffer, bounds);
}

class FrameBufferCanvas2D implements Canvas2D {
  readonly bounds: Rect;

  private readonly brailleCells = new Map<string, { readonly mask: number; readonly style?: TerminalStyle }>();

  private transform: CanvasTransform = identityCanvasTransform;

  constructor(private readonly buffer: FrameBuffer, bounds: Rect) {
    this.bounds = bounds;
  }

  point(x: number, y: number, span: RenderSpan): void {
    const point = this.transformedPoint(x, y);
    if (!this.inside(point.x, point.y)) return;
    this.buffer.write(this.rowFor(point.y), this.columnFor(point.x), this.clipAt(point.x, [span]));
  }

  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void {
    const start = this.transformedPoint(x1, y1);
    const end = this.transformedPoint(x2, y2);
    for (const point of linePoints(start.x, start.y, end.x, end.y)) {
      this.rawPoint(point.x, point.y, span);
    }
  }

  polyline(points: readonly CanvasPoint[], span: RenderSpan): void {
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (start === undefined || end === undefined) continue;
      this.line(start.x, start.y, end.x, end.y, span);
    }
  }

  rect(bounds: Rect, options: StrokeFillOptions): void {
    const transformed = transformCanvasRect(this.transform, bounds);
    const fill = options.fill;
    const stroke = options.stroke;
    if (fill !== undefined) {
      for (const point of rectInteriorPoints(transformed)) this.rawPoint(point.x, point.y, fill);
    }
    if (stroke !== undefined) {
      for (const point of rectStrokePoints(transformed)) this.rawPoint(point.x, point.y, stroke);
    }
  }

  circle(center: CanvasPoint, radius: number, options: StrokeFillOptions): void {
    this.ellipse(center, radius, radius, options);
  }

  ellipse(center: CanvasPoint, radiusX: number, radiusY: number, options: StrokeFillOptions): void {
    const transformed = this.transformedPoint(center.x, center.y);
    const rx = Math.abs(radiusX * this.transform.scaleX);
    const ry = Math.abs(radiusY * this.transform.scaleY);
    if (options.fill !== undefined) {
      for (const point of ellipseInteriorPoints(transformed, rx, ry)) this.rawPoint(point.x, point.y, options.fill);
    }
    if (options.stroke !== undefined) {
      for (const point of ellipseStrokePoints(transformed, rx, ry)) this.rawPoint(point.x, point.y, options.stroke);
    }
  }

  arc(center: CanvasPoint, radius: number, startAngle: number, endAngle: number, options: StrokeFillOptions): void {
    if (options.stroke === undefined) return;
    const transformed = this.transformedPoint(center.x, center.y);
    const rx = Math.abs(radius * this.transform.scaleX);
    const ry = Math.abs(radius * this.transform.scaleY);
    for (const point of ellipseStrokePoints(transformed, rx, ry, startAngle, endAngle)) {
      this.rawPoint(point.x, point.y, options.stroke);
    }
  }

  fillPolygon(points: readonly CanvasPoint[], span: RenderSpan): void {
    const transformed = points.map((point) => this.transformedPoint(point.x, point.y));
    for (const point of polygonInteriorPoints(transformed)) this.rawPoint(point.x, point.y, span);
  }

  text(x: number, y: number, spans: readonly RenderSpan[]): void {
    const point = this.transformedPoint(x, y);
    if (!this.inside(point.x, point.y)) return;
    this.buffer.write(this.rowFor(point.y), this.columnFor(point.x), this.clipAt(point.x, spans));
  }

  braillePoint(x: number, y: number, style?: TerminalStyle): void {
    const transformed = this.transformedPoint(x, y);
    const point = brailleCellForPoint(transformed.x, transformed.y);
    if (!this.inside(point.cell.x, point.cell.y)) return;
    const key = `${String(point.cell.x)}:${String(point.cell.y)}`;
    const previous = this.brailleCells.get(key);
    const next = {
      mask: (previous?.mask ?? 0) | point.mask,
      ...(style === undefined ? previous?.style === undefined ? {} : { style: previous.style } : { style })
    };
    this.brailleCells.set(key, next);
    this.point(point.cell.x, point.cell.y, {
      text: brailleCharacter(next.mask),
      ...(next.style === undefined ? {} : { style: next.style })
    });
  }

  clear(bounds?: Rect): void {
    if (bounds === undefined) {
      this.brailleCells.clear();
      this.buffer.clear(this.bounds);
      return;
    }
    const transformed = transformCanvasRect(this.transform, bounds);
    const absolute = {
      row: this.rowFor(transformed.row),
      column: this.columnFor(transformed.column),
      width: transformed.width,
      height: transformed.height
    };
    this.clearBrailleCells(transformed);
    this.buffer.clear(absolute);
  }

  translate(dx: number, dy: number): void {
    this.transform = composeCanvasTransform(this.transform, { translateX: dx, translateY: dy });
  }

  scale(x: number, y: number): void {
    this.transform = composeCanvasTransform(this.transform, { scaleX: x, scaleY: y });
  }

  withTransform(transform: CanvasTransformInput, draw: (canvas: Canvas2D) => void): void {
    const previous = this.transform;
    this.transform = composeCanvasTransform(this.transform, transform);
    try {
      draw(this);
    } finally {
      this.transform = previous;
    }
  }

  private rawPoint(x: number, y: number, span: RenderSpan): void {
    if (!this.inside(x, y)) return;
    this.buffer.write(this.rowFor(y), this.columnFor(x), this.clipAt(x, [span]));
  }

  private transformedPoint(x: number, y: number): CanvasPoint {
    return transformCanvasPoint(this.transform, { x, y });
  }

  private inside(x: number, y: number): boolean {
    const column = Math.floor(x);
    const row = Math.floor(y);
    return row >= 0
      && row < this.bounds.height
      && column >= 0
      && column < this.bounds.width;
  }

  private rowFor(y: number): number {
    return this.bounds.row + Math.floor(y);
  }

  private columnFor(x: number): number {
    return this.bounds.column + Math.floor(x);
  }

  private clipAt(x: number, spans: readonly RenderSpan[]): readonly RenderSpan[] {
    return clipRenderSpans(spans, Math.max(0, this.bounds.width - Math.floor(x)));
  }

  private clearBrailleCells(bounds: Rect): void {
    const rowStart = Math.floor(bounds.row);
    const rowEnd = rowStart + Math.max(0, Math.floor(bounds.height));
    const columnStart = Math.floor(bounds.column);
    const columnEnd = columnStart + Math.max(0, Math.floor(bounds.width));
    for (const key of this.brailleCells.keys()) {
      const [xRaw, yRaw] = key.split(':');
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (y >= rowStart && y < rowEnd && x >= columnStart && x < columnEnd) {
        this.brailleCells.delete(key);
      }
    }
  }
}
