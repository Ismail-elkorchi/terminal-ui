import type { Rect } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

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

export interface StrokeFillOptions {
  readonly stroke?: RenderSpan;
  readonly fill?: RenderSpan;
}

export interface Canvas2D {
  readonly bounds: Rect;
  readonly widthProfile: TextWidthProfile;
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
