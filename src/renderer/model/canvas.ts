import type { Rect } from '../../geometry/types.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { Canvas2D } from './canvas2d.ts';

export type { Canvas2D } from './canvas2d.ts';

export interface CanvasPainterInput {
  readonly canvas: Canvas2D;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export type CanvasPainter = (input: CanvasPainterInput) => void;
