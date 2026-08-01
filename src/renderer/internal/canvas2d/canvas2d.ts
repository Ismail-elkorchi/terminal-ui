import { brailleCellForSubcell, brailleCharacter } from './braille.ts';
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
import type {
  Canvas2D,
  CanvasPoint,
  CanvasTransform,
  CanvasTransformInput,
  RenderTarget,
  StrokeFillOptions
} from '../../contracts.ts';
import type { Rect } from '../../contracts.ts';
import type { RenderSpan, TerminalStyle } from '../../../visual/render.ts';
import { clipRenderSpans } from '../../../visual/render.ts';
import type { TextWidthProfile } from '../../../text/index.ts';

export function createCanvas2D(buffer: RenderTarget, bounds: Rect): Canvas2D {
  assertCanvasBounds(buffer, bounds);
  return new FrameBufferCanvas2D(buffer, bounds);
}

export function createClippedCanvas2D(
  buffer: RenderTarget,
  bounds: Rect
): Canvas2D {
  assertLogicalCanvasBounds(bounds);
  return new FrameBufferCanvas2D(buffer, bounds);
}

class FrameBufferCanvas2D implements Canvas2D {
  readonly bounds: Rect;
  readonly #buffer: RenderTarget;

  private readonly brailleCells = new Map<string, { readonly mask: number; readonly style?: TerminalStyle }>();

  private transform: CanvasTransform = identityCanvasTransform;

  constructor(buffer: RenderTarget, bounds: Rect) {
    this.#buffer = buffer;
    this.bounds = bounds;
  }

  get widthProfile(): TextWidthProfile {
    return this.#buffer.widthProfile;
  }

  point(x: number, y: number, span: RenderSpan): void {
    assertIntegerCoordinates('point', x, y);
    const point = this.transformedPoint(x, y);
    if (!this.inside(point.x, point.y)) return;
    this.#buffer.write(this.rowFor(point.y), this.columnFor(point.x), this.clipAt(point.x, [span]));
  }

  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void {
    assertIntegerCoordinates('line', x1, y1, x2, y2);
    const start = this.transformedPoint(x1, y1);
    const end = this.transformedPoint(x2, y2);
    for (const point of linePoints(start.x, start.y, end.x, end.y)) {
      this.rawPoint(point.x, point.y, span);
    }
  }

  polyline(points: readonly CanvasPoint[], span: RenderSpan): void {
    for (const point of points) assertIntegerCoordinates('polyline point', point.x, point.y);
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (start === undefined || end === undefined) continue;
      this.line(start.x, start.y, end.x, end.y, span);
    }
  }

  rect(
    bounds: CanvasPoint & { readonly width: number; readonly height: number },
    options: StrokeFillOptions
  ): void {
    assertIntegerCoordinates('rectangle position', bounds.x, bounds.y);
    assertNonNegativeIntegerSizes('rectangle', bounds.width, bounds.height);
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
    assertIntegerCoordinates('circle center', center.x, center.y);
    assertNonNegativeIntegerSizes('circle radius', radius);
    this.ellipse(center, radius, radius, options);
  }

  ellipse(center: CanvasPoint, radiusX: number, radiusY: number, options: StrokeFillOptions): void {
    assertIntegerCoordinates('ellipse center', center.x, center.y);
    assertNonNegativeIntegerSizes('ellipse radius', radiusX, radiusY);
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
    assertIntegerCoordinates('arc center', center.x, center.y);
    assertNonNegativeIntegerSizes('arc radius', radius);
    assertFiniteNumbers('arc angle', startAngle, endAngle);
    if (options.stroke === undefined) return;
    const transformed = this.transformedPoint(center.x, center.y);
    const rx = Math.abs(radius * this.transform.scaleX);
    const ry = Math.abs(radius * this.transform.scaleY);
    for (const point of ellipseStrokePoints(transformed, rx, ry, startAngle, endAngle)) {
      this.rawPoint(point.x, point.y, options.stroke);
    }
  }

  fillPolygon(points: readonly CanvasPoint[], span: RenderSpan): void {
    for (const point of points) assertIntegerCoordinates('polygon point', point.x, point.y);
    const transformed = points.map((point) => this.transformedPoint(point.x, point.y));
    for (const point of polygonInteriorPoints(transformed)) this.rawPoint(point.x, point.y, span);
  }

  text(x: number, y: number, spans: readonly RenderSpan[]): void {
    assertIntegerCoordinates('text', x, y);
    const point = this.transformedPoint(x, y);
    if (!this.inside(point.x, point.y)) return;
    this.#buffer.write(this.rowFor(point.y), this.columnFor(point.x), this.clipAt(point.x, spans));
  }

  brailleSubcell(columnSubcell: number, rowSubcell: number, style?: TerminalStyle): void {
    assertIntegerCoordinates('Braille subcell', columnSubcell, rowSubcell);
    const transformed = this.transformedPoint(columnSubcell, rowSubcell);
    const mapping = brailleCellForSubcell(transformed.x, transformed.y);
    if (!this.inside(mapping.cell.x, mapping.cell.y)) return;
    const key = `${String(mapping.cell.x)}:${String(mapping.cell.y)}`;
    const previous = this.brailleCells.get(key);
    const next = {
      mask: (previous?.mask ?? 0) | mapping.mask,
      ...(style === undefined ? previous?.style === undefined ? {} : { style: previous.style } : { style })
    };
    this.brailleCells.set(key, next);
    this.point(mapping.cell.x, mapping.cell.y, {
      text: brailleCharacter(next.mask),
      ...(next.style === undefined ? {} : { style: next.style })
    });
  }

  clear(bounds?: CanvasPoint & { readonly width: number; readonly height: number }): void {
    if (bounds === undefined) {
      this.brailleCells.clear();
      this.#buffer.clear(this.bounds);
      return;
    }
    assertIntegerCoordinates('clear rectangle position', bounds.x, bounds.y);
    assertNonNegativeIntegerSizes('clear rectangle', bounds.width, bounds.height);
    const transformed = transformCanvasRect(this.transform, bounds);
    const absolute = {
      row: this.rowFor(transformed.y),
      column: this.columnFor(transformed.x),
      width: transformed.width,
      height: transformed.height
    };
    this.clearBrailleCells(transformed);
    this.#buffer.clear(absolute);
  }

  translate(dx: number, dy: number): void {
    assertIntegerCoordinates('translation', dx, dy);
    this.transform = composeCanvasTransform(this.transform, { translateX: dx, translateY: dy });
  }

  scale(x: number, y: number): void {
    assertNonZeroIntegers('scale', x, y);
    this.transform = composeCanvasTransform(this.transform, { scaleX: x, scaleY: y });
  }

  withTransform(transform: CanvasTransformInput, draw: (canvas: Canvas2D) => void): void {
    assertOptionalInteger('translateX', transform.translateX, true);
    assertOptionalInteger('translateY', transform.translateY, true);
    assertOptionalInteger('scaleX', transform.scaleX, false);
    assertOptionalInteger('scaleY', transform.scaleY, false);
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
    this.#buffer.write(this.rowFor(y), this.columnFor(x), this.clipAt(x, [span]));
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
    return clipRenderSpans(spans, Math.max(0, this.bounds.width - Math.floor(x)), {
      widthProfile: this.#buffer.widthProfile
    });
  }

  private clearBrailleCells(
    bounds: CanvasPoint & { readonly width: number; readonly height: number }
  ): void {
    const rowStart = Math.floor(bounds.y);
    const rowEnd = rowStart + Math.max(0, Math.floor(bounds.height));
    const columnStart = Math.floor(bounds.x);
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

function assertCanvasBounds(buffer: RenderTarget, bounds: Rect): void {
  if (
    !validLogicalCanvasBounds(bounds)
    || bounds.row < 1
    || bounds.column < 1
    || bounds.row + bounds.height - 1 > buffer.height
    || bounds.column + bounds.width - 1 > buffer.width
  ) {
    throw new RangeError('Canvas2D bounds must be an integer rectangle inside the drawing target.');
  }
}

function assertLogicalCanvasBounds(bounds: Rect): void {
  if (!validLogicalCanvasBounds(bounds)) {
    throw new RangeError('Canvas2D bounds must be a safe-integer rectangle with non-negative size.');
  }
}

function validLogicalCanvasBounds(bounds: Rect): boolean {
  return Number.isSafeInteger(bounds.row)
    && Number.isSafeInteger(bounds.column)
    && Number.isSafeInteger(bounds.width)
    && Number.isSafeInteger(bounds.height)
    && bounds.width >= 0
    && bounds.height >= 0;
}

function assertIntegerCoordinates(operation: string, ...values: readonly number[]): void {
  if (values.every(Number.isInteger)) return;
  throw new RangeError(`Canvas2D ${operation} coordinates must be finite integers.`);
}

function assertFiniteNumbers(operation: string, ...values: readonly number[]): void {
  if (values.every(Number.isFinite)) return;
  throw new RangeError(`Canvas2D ${operation} values must be finite numbers.`);
}

function assertNonNegativeIntegerSizes(operation: string, ...values: readonly number[]): void {
  if (values.every((value) => Number.isInteger(value) && value >= 0)) return;
  throw new RangeError(`Canvas2D ${operation} values must be non-negative integers.`);
}

function assertNonZeroIntegers(operation: string, ...values: readonly number[]): void {
  if (values.every((value) => Number.isInteger(value) && value !== 0)) return;
  throw new RangeError(`Canvas2D ${operation} values must be non-zero integers.`);
}

function assertOptionalInteger(
  name: string,
  value: number | undefined,
  allowZero: boolean
): void {
  if (value === undefined || (Number.isInteger(value) && (allowZero || value !== 0))) return;
  throw new RangeError(
    `Canvas2D transform ${name} must be ${allowZero ? 'an integer' : 'a non-zero integer'}.`
  );
}
