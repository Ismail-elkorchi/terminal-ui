import type { CanvasPainter } from '../../renderer/contracts.ts';
import type { CanvasStylePart } from '../../ui-model/style-parts.ts';
import type { ElementOptions } from '../../element/metadata.ts';

export interface CanvasOptions extends ElementOptions<CanvasStylePart> {
  readonly painter: CanvasPainter;
  readonly label?: string;
}

export type { CanvasPainter, CanvasPainterInput } from '../../renderer/contracts.ts';
