import type { TerminalTheme } from '../../theme/index.ts';
import type { Canvas2D } from '../../tui/canvas2d/index.ts';
import type { Rect } from '../../tui/layout.ts';
import type { CanvasStylePart } from '../style-parts.ts';
import type { ComponentOptions } from './base.ts';

export interface CanvasPainterInput {
  readonly canvas: Canvas2D;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export type CanvasPainter = (input: CanvasPainterInput) => void;

export interface CanvasOptions extends ComponentOptions<CanvasStylePart> {
  readonly painter: CanvasPainter;
  readonly label?: string;
}
