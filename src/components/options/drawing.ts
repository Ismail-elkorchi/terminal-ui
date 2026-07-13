import type { CanvasPainter } from '../../renderer/model/canvas.ts';
import type { CanvasStylePart } from '../../ui-model/style-parts.ts';
import type { ElementOptions } from '../../element/metadata.ts';

export interface CanvasOptions extends ElementOptions<CanvasStylePart> {
  readonly painter: CanvasPainter;
  readonly label?: string;
}

export type { CanvasPainter, CanvasPainterInput } from '../../renderer/model/canvas.ts';
