import { executeSynchronousRenderCallback } from '../../foundation/synchronous-render.ts';
import type { Rect } from '../../geometry/types.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type {
  Canvas2D,
  CanvasPoint,
  CanvasTransform,
  CanvasTransformInput,
  ComponentRenderTarget,
  FrameRenderTarget,
  RenderTarget,
  StrokeFillOptions,
} from '../contracts.ts';
import { brailleCellForSubcell, brailleCharacter } from './braille.ts';
import {
  clippedEllipseInteriorPoints,
  clippedEllipseStrokePoints,
  clippedPolygonInteriorPoints,
} from './shapes.ts';
import {
  composeCanvasTransform,
  identityCanvasTransform,
  transformCanvasPoint,
  transformCanvasRect,
} from './transform.ts';

/** Creates a bounded canvas on a one-based frame target; rejects a component-local target. */
export function createCanvas2D(buffer: FrameRenderTarget, bounds: Rect): Canvas2D {
  const coordinateSpace: unknown = buffer.coordinateSpace;
  if (coordinateSpace !== 'frame') {
    throw new TypeError('createCanvas2D requires a one-based frame drawing target.');
  }
  assertCanvasBounds(buffer, bounds);
  return new FrameBufferCanvas2D(buffer, bounds);
}

/** Creates a zero-based canvas inside a component target. Omitted bounds cover the local target. */
export function createComponentCanvas2D(
  buffer: ComponentRenderTarget,
  bounds: Rect = { row: 0, column: 0, width: buffer.width, height: buffer.height },
): Canvas2D {
  const coordinateSpace: unknown = buffer.coordinateSpace;
  if (coordinateSpace !== 'component') {
    throw new TypeError('createComponentCanvas2D requires a zero-based component drawing target.');
  }
  assertComponentCanvasBounds(buffer, bounds);
  return new FrameBufferCanvas2D(buffer, bounds);
}

class FrameBufferCanvas2D implements Canvas2D {
  readonly bounds: Rect;
  readonly #buffer: RenderTarget;

  private readonly brailleCells: Map<string, { readonly mask: number; readonly style?: TerminalStyle }>;

  private transform: CanvasTransform = identityCanvasTransform;
  private active = true;

  constructor(
    buffer: RenderTarget,
    bounds: Rect,
    transform: CanvasTransform = identityCanvasTransform,
    brailleCells = new Map<string, { readonly mask: number; readonly style?: TerminalStyle }>(),
  ) {
    this.#buffer = buffer;
    this.bounds = Object.freeze({ ...bounds });
    this.transform = transform;
    this.brailleCells = brailleCells;
  }

  private assertActive(): void {
    if (!this.active) throw new Error('Canvas2D transform scope is closed.');
  }

  private close(): void { this.active = false; }

  get widthProfile(): TextWidthProfile {
    return this.#buffer.widthProfile;
  }

  point(x: number, y: number, span: RenderSpan): void {
    this.assertActive();
    assertIntegerCoordinates('point', x, y);
    const point = this.transformedPoint(x, y);
    this.paintPoints([point], normalizeCanvasBrush(span, this.widthProfile));
  }

  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void {
    this.assertActive();
    assertIntegerCoordinates('line', x1, y1, x2, y2);
    const start = this.transformedPoint(x1, y1);
    const end = this.transformedPoint(x2, y2);
    this.paintPoints(
      visibleLinePoints(start, end, this.bounds.width, this.bounds.height),
      normalizeCanvasBrush(span, this.widthProfile),
    );
  }

  polyline(points: readonly CanvasPoint[], span: RenderSpan): void {
    this.assertActive();
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
    this.assertActive();
    assertIntegerCoordinates('rectangle position', bounds.x, bounds.y);
    assertNonNegativeIntegerSizes('rectangle', bounds.width, bounds.height);
    const transformed = transformCanvasRect(this.transform, bounds);
    const fill = options.fill;
    const stroke = options.stroke;
    const fromX = Math.max(0, transformed.x);
    const fromY = Math.max(0, transformed.y);
    const toX = Math.min(this.bounds.width, transformed.x + transformed.width);
    const toY = Math.min(this.bounds.height, transformed.y + transformed.height);
    if (fromX >= toX || fromY >= toY) return;
    if (fill !== undefined) {
      const brush = normalizeCanvasBrush(fill, this.widthProfile);
      for (let row = fromY; row < toY; row += 1) this.paintRun(row, fromX, toX, brush);
    }
    if (stroke !== undefined) {
      const brush = normalizeCanvasBrush(stroke, this.widthProfile);
      const lastX = transformed.x + transformed.width - 1;
      const lastY = transformed.y + transformed.height - 1;
      if (transformed.y >= fromY && transformed.y < toY) this.paintRun(transformed.y, fromX, toX, brush);
      if (lastY !== transformed.y && lastY >= fromY && lastY < toY) this.paintRun(lastY, fromX, toX, brush);
      for (let row = fromY; row < toY; row += 1) {
        if (row === transformed.y || row === lastY) continue;
        if (transformed.x >= fromX && transformed.x < toX) this.paintRun(row, transformed.x, transformed.x + 1, brush);
        if (lastX !== transformed.x && lastX >= fromX && lastX < toX) this.paintRun(row, lastX, lastX + 1, brush);
      }
    }
  }

  circle(center: CanvasPoint, radius: number, options: StrokeFillOptions): void {
    this.assertActive();
    assertIntegerCoordinates('circle center', center.x, center.y);
    assertNonNegativeIntegerSizes('circle radius', radius);
    this.ellipse(center, radius, radius, options);
  }

  ellipse(center: CanvasPoint, radiusX: number, radiusY: number, options: StrokeFillOptions): void {
    this.assertActive();
    assertIntegerCoordinates('ellipse center', center.x, center.y);
    assertNonNegativeIntegerSizes('ellipse radius', radiusX, radiusY);
    const transformed = this.transformedPoint(center.x, center.y);
    const rx = Math.abs(radiusX * this.transform.scaleX);
    const ry = Math.abs(radiusY * this.transform.scaleY);
    assertNonNegativeIntegerSizes('transformed ellipse', rx, ry);
    if (options.fill !== undefined) {
      this.paintPoints(
        clippedEllipseInteriorPoints(transformed, rx, ry, this.bounds),
        normalizeCanvasBrush(options.fill, this.widthProfile),
      );
    }
    if (options.stroke !== undefined) {
      this.paintPoints(
        clippedEllipseStrokePoints(transformed, rx, ry, this.bounds),
        normalizeCanvasBrush(options.stroke, this.widthProfile),
      );
    }
  }

  arc(center: CanvasPoint, radius: number, startAngle: number, endAngle: number, options: StrokeFillOptions): void {
    this.assertActive();
    assertIntegerCoordinates('arc center', center.x, center.y);
    assertNonNegativeIntegerSizes('arc radius', radius);
    assertFiniteNumbers('arc angle', startAngle, endAngle);
    if (options.stroke === undefined) return;
    const transformed = this.transformedPoint(center.x, center.y);
    const rx = Math.abs(radius * this.transform.scaleX);
    const ry = Math.abs(radius * this.transform.scaleY);
    assertNonNegativeIntegerSizes('transformed arc', rx, ry);
    this.paintPoints(
      clippedEllipseStrokePoints(transformed, rx, ry, this.bounds, startAngle, endAngle),
      normalizeCanvasBrush(options.stroke, this.widthProfile),
    );
  }

  fillPolygon(points: readonly CanvasPoint[], span: RenderSpan): void {
    this.assertActive();
    for (const point of points) assertIntegerCoordinates('polygon point', point.x, point.y);
    const transformed = points.map((point) => this.transformedPoint(point.x, point.y));
    this.paintPoints(clippedPolygonInteriorPoints(transformed, this.bounds), normalizeCanvasBrush(span, this.widthProfile));
  }

  text(x: number, y: number, spans: readonly RenderSpan[]): void {
    this.assertActive();
    assertIntegerCoordinates('text', x, y);
    const point = this.transformedPoint(x, y);
    if (point.y < 0 || point.y >= this.bounds.height) return;
    let column = point.x;
    for (const span of spans) {
      const measured = measureTextCells(span.text, { widthProfile: this.widthProfile });
      let runStart: number | undefined;
      let run = '';
      const flush = (): void => {
        if (runStart === undefined) return;
        this.#buffer.write(this.rowFor(point.y), this.columnFor(runStart), [{ ...span, text: run }]);
        runStart = undefined;
        run = '';
      };
      for (const segment of measured.graphemes) {
        const end = column + segment.cells;
        if (segment.cells > 0 && column >= 0 && end <= this.bounds.width) {
          runStart ??= column;
          run += segment.text;
        } else flush();
        column = end;
      }
      flush();
    }
  }

  brailleSubcell(columnSubcell: number, rowSubcell: number, style?: TerminalStyle): void {
    this.assertActive();
    assertIntegerCoordinates('Braille subcell', columnSubcell, rowSubcell);
    const transformed = {
      x: columnSubcell * this.transform.scaleX + this.transform.translateX * 2,
      y: rowSubcell * this.transform.scaleY + this.transform.translateY * 4,
    };
    assertIntegerCoordinates('transformed Braille subcell', transformed.x, transformed.y);
    const mapping = brailleCellForSubcell(transformed.x, transformed.y);
    if (!this.inside(mapping.cell.x, mapping.cell.y)) return;
    const key = `${String(mapping.cell.x)}:${String(mapping.cell.y)}`;
    const previous = this.brailleCells.get(key);
    const next = {
      mask: (previous?.mask ?? 0) | mapping.mask,
      ...(style === undefined ? previous?.style === undefined ? {} : { style: previous.style } : { style })
    };
    this.brailleCells.set(key, next);
    this.paintPoints([mapping.cell], normalizeCanvasBrush({
      text: brailleCharacter(next.mask),
      ...(next.style === undefined ? {} : { style: next.style })
    }, this.widthProfile));
  }

  clear(bounds?: CanvasPoint & { readonly width: number; readonly height: number }): void {
    this.assertActive();
    if (bounds === undefined) {
      this.clearBrailleCells({ x: 0, y: 0, width: this.bounds.width, height: this.bounds.height });
      this.#buffer.clear(this.bounds);
      return;
    }
    assertIntegerCoordinates('clear rectangle position', bounds.x, bounds.y);
    assertNonNegativeIntegerSizes('clear rectangle', bounds.width, bounds.height);
    const transformed = transformCanvasRect(this.transform, bounds);
    const clipped = {
      x: Math.max(0, transformed.x),
      y: Math.max(0, transformed.y),
      width: Math.max(0, Math.min(this.bounds.width, transformed.x + transformed.width) - Math.max(0, transformed.x)),
      height: Math.max(0, Math.min(this.bounds.height, transformed.y + transformed.height) - Math.max(0, transformed.y)),
    };
    if (clipped.width === 0 || clipped.height === 0) return;
    const absolute = {
      row: this.rowFor(clipped.y),
      column: this.columnFor(clipped.x),
      width: clipped.width,
      height: clipped.height
    };
    this.clearBrailleCells(clipped);
    this.#buffer.clear(absolute);
  }

  translate(dx: number, dy: number): void {
    this.assertActive();
    assertIntegerCoordinates('translation', dx, dy);
    this.transform = composeCanvasTransform(this.transform, { translateX: dx, translateY: dy });
  }

  scale(x: number, y: number): void {
    this.assertActive();
    assertNonZeroIntegers('scale', x, y);
    this.transform = composeCanvasTransform(this.transform, { scaleX: x, scaleY: y });
  }

  withTransform(transform: CanvasTransformInput, draw: (canvas: Canvas2D) => undefined): void {
    this.assertActive();
    assertOptionalInteger('translateX', transform.translateX, true);
    assertOptionalInteger('translateY', transform.translateY, true);
    assertOptionalInteger('scaleX', transform.scaleX, false);
    assertOptionalInteger('scaleY', transform.scaleY, false);
    const scoped = new FrameBufferCanvas2D(
      this.#buffer,
      this.bounds,
      composeCanvasTransform(this.transform, transform),
      this.brailleCells,
    );
    try {
      executeSynchronousRenderCallback(draw, scoped, 'Canvas2D withTransform callback');
    } finally {
      scoped.close();
    }
  }

  private paintPoints(points: Iterable<CanvasPoint>, brush: RenderSpan): void {
    const rows = new Map<number, Set<number>>();
    for (const point of points) {
      if (!this.inside(point.x, point.y)) continue;
      const row = Math.floor(point.y);
      const columns = rows.get(row) ?? new Set<number>();
      rows.set(row, columns);
      columns.add(Math.floor(point.x));
    }
    for (const [row, columns] of rows) {
      const sorted = [...columns].toSorted((left, right) => left - right);
      let runStart: number | undefined;
      let previous: number | undefined;
      const flush = (): void => {
        if (runStart === undefined || previous === undefined) return;
        this.#buffer.write(this.rowFor(row), this.columnFor(runStart), [{
          ...brush,
          text: brush.text.repeat(previous - runStart + 1),
        }]);
      };
      for (const column of sorted) {
        if (previous !== undefined && column !== previous + 1) {
          flush();
          runStart = column;
        } else runStart ??= column;
        previous = column;
      }
      flush();
    }
  }

  private paintRun(row: number, from: number, to: number, brush: RenderSpan): void {
    if (to <= from) return;
    this.#buffer.write(this.rowFor(row), this.columnFor(from), [{
      ...brush,
      text: brush.text.repeat(to - from),
    }]);
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

function normalizeCanvasBrush(span: RenderSpan, widthProfile: TextWidthProfile): RenderSpan {
  const measured = measureTextCells(span.text, { widthProfile });
  if (measured.graphemes.length !== 1 || measured.cells !== 1) {
    throw new RangeError('Canvas2D point and shape brushes must contain exactly one one-cell grapheme.');
  }
  return { ...span, text: measured.text };
}

function* visibleLinePoints(
  start: CanvasPoint, end: CanvasPoint, width: number, height: number,
): Iterable<CanvasPoint> {
  if (width <= 0 || height <= 0) return;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const steps = Math.max(dx, dy);
  if (!Number.isSafeInteger(steps) || steps === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Canvas line extent exceeds safe integer coordinates.');
  }
  const sx = end.x >= start.x ? 1 : -1;
  const sy = end.y >= start.y ? 1 : -1;
  const majorX = dx >= dy;
  const minor = majorX ? dy : dx;
  const bias = Math.floor((steps - 1) / 2);
  const useBigInt = steps * minor + bias > Number.MAX_SAFE_INTEGER;
  const majorBig = useBigInt ? BigInt(steps) : 0n;
  const minorBig = useBigInt ? BigInt(minor) : 0n;
  const biasBig = useBigInt ? BigInt(bias) : 0n;
  const minorSteps = (index: number): number => steps === 0 ? 0 : useBigInt
    ? Number((BigInt(index) * minorBig + biasBig) / majorBig)
    : Math.floor((index * minor + bias) / steps);
  const pointAt = (index: number): CanvasPoint => majorX
    ? { x: start.x + sx * index, y: start.y + sy * minorSteps(index) }
    : { x: start.x + sx * minorSteps(index), y: start.y + sy * index };
  const lowerBound = (predicate: (index: number) => boolean): number => {
    let low = 0;
    let high = steps + 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (predicate(middle)) high = middle;
      else low = middle + 1;
    }
    return low;
  };
  const axisRange = (axis: 'x' | 'y', size: number): readonly [number, number] => {
    const first = pointAt(0)[axis];
    const last = pointAt(steps)[axis];
    return first <= last
      ? [
        lowerBound((index) => pointAt(index)[axis] >= 0),
        lowerBound((index) => pointAt(index)[axis] >= size),
      ]
      : [
        lowerBound((index) => pointAt(index)[axis] < size),
        lowerBound((index) => pointAt(index)[axis] < 0),
      ];
  };
  const [xFirst, xAfter] = axisRange('x', width);
  const [yFirst, yAfter] = axisRange('y', height);
  for (let index = Math.max(xFirst, yFirst); index < Math.min(xAfter, yAfter); index += 1) {
    yield pointAt(index);
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

function assertComponentCanvasBounds(buffer: ComponentRenderTarget, bounds: Rect): void {
  if (!validLogicalCanvasBounds(bounds)
    || bounds.row < 0 || bounds.column < 0
    || bounds.row + bounds.height > buffer.height
    || bounds.column + bounds.width > buffer.width) {
    throw new RangeError('Component Canvas2D bounds must be a zero-based rectangle inside the component target.');
  }
}

function validLogicalCanvasBounds(bounds: Rect): boolean {
  return Number.isSafeInteger(bounds.row)
    && Number.isSafeInteger(bounds.column)
    && Number.isSafeInteger(bounds.width)
    && Number.isSafeInteger(bounds.height)
    && bounds.width >= 0
    && bounds.height >= 0
    && Number.isSafeInteger(bounds.row + bounds.height)
    && Number.isSafeInteger(bounds.column + bounds.width);
}

function assertIntegerCoordinates(operation: string, ...values: readonly number[]): void {
  if (values.every(Number.isSafeInteger)) return;
  throw new RangeError(`Canvas2D ${operation} coordinates must be safe integers.`);
}

function assertFiniteNumbers(operation: string, ...values: readonly number[]): void {
  if (values.every(Number.isFinite)) return;
  throw new RangeError(`Canvas2D ${operation} values must be finite numbers.`);
}

function assertNonNegativeIntegerSizes(operation: string, ...values: readonly number[]): void {
  if (values.every((value) => Number.isSafeInteger(value) && value >= 0)) return;
  throw new RangeError(`Canvas2D ${operation} values must be non-negative safe integers.`);
}

function assertNonZeroIntegers(operation: string, ...values: readonly number[]): void {
  if (values.every((value) => Number.isSafeInteger(value) && value !== 0)) return;
  throw new RangeError(`Canvas2D ${operation} values must be non-zero safe integers.`);
}

function assertOptionalInteger(
  name: string,
  value: number | undefined,
  allowZero: boolean
): void {
  if (value === undefined || (Number.isSafeInteger(value) && (allowZero || value !== 0))) return;
  throw new RangeError(
    `Canvas2D transform ${name} must be ${allowZero ? 'an integer' : 'a non-zero integer'}.`
  );
}
