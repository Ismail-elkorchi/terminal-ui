import { brailleCellForPoint, brailleCharacter } from './braille.ts';
import { linePoints } from './paths.ts';
import { rectInteriorPoints, rectStrokePoints } from './shapes.ts';
import type { FrameBuffer } from '../frame.ts';
import type { Rect } from '../layout.ts';
import type { RenderSpan, TerminalStyle } from '../render-primitives.ts';
import { clipRenderSpans } from '../render-primitives.ts';

export interface StrokeFillOptions {
  readonly stroke?: RenderSpan;
  readonly fill?: RenderSpan;
}

export interface Canvas2D {
  readonly bounds: Rect;
  point(x: number, y: number, span: RenderSpan): void;
  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void;
  rect(bounds: Rect, options: StrokeFillOptions): void;
  text(x: number, y: number, spans: readonly RenderSpan[]): void;
  braillePoint(x: number, y: number, style?: TerminalStyle): void;
  clear(bounds?: Rect): void;
}

export function createCanvas2D(buffer: FrameBuffer, bounds: Rect): Canvas2D {
  return new FrameBufferCanvas2D(buffer, bounds);
}

class FrameBufferCanvas2D implements Canvas2D {
  readonly bounds: Rect;

  private readonly brailleCells = new Map<string, { readonly mask: number; readonly style?: TerminalStyle }>();

  constructor(private readonly buffer: FrameBuffer, bounds: Rect) {
    this.bounds = bounds;
  }

  point(x: number, y: number, span: RenderSpan): void {
    if (!this.inside(x, y)) return;
    this.buffer.write(this.rowFor(y), this.columnFor(x), this.clipAt(x, [span]));
  }

  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void {
    for (const point of linePoints(x1, y1, x2, y2)) {
      this.point(point.x, point.y, span);
    }
  }

  rect(bounds: Rect, options: StrokeFillOptions): void {
    const fill = options.fill;
    const stroke = options.stroke;
    if (fill !== undefined) {
      for (const point of rectInteriorPoints(bounds)) this.point(point.x, point.y, fill);
    }
    if (stroke !== undefined) {
      for (const point of rectStrokePoints(bounds)) this.point(point.x, point.y, stroke);
    }
  }

  text(x: number, y: number, spans: readonly RenderSpan[]): void {
    if (!this.inside(x, y)) return;
    this.buffer.write(this.rowFor(y), this.columnFor(x), this.clipAt(x, spans));
  }

  braillePoint(x: number, y: number, style?: TerminalStyle): void {
    const point = brailleCellForPoint(x, y);
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
    const absolute = {
      row: this.rowFor(bounds.row),
      column: this.columnFor(bounds.column),
      width: bounds.width,
      height: bounds.height
    };
    this.clearBrailleCells(bounds);
    this.buffer.clear(absolute);
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
