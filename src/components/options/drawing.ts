import type { ComponentMetadataOptions } from '../../component/index.ts';
import type {
  CanvasPainter,
  Measurement
} from '../../renderer/contracts.ts';
import type { CanvasStylePart } from '../../ui-model/style-parts.ts';

interface CanvasOptionsBase {
  readonly id?: string;
  readonly painter: CanvasPainter;
  readonly measurement: Measurement;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], CanvasStylePart>;
}

export interface SemanticCanvasOptions extends CanvasOptionsBase {
  readonly decorative?: false;
  readonly label: string;
}

export interface DecorativeCanvasOptions extends CanvasOptionsBase {
  readonly decorative: true;
  readonly label?: never;
}

export type CanvasOptions =
  | SemanticCanvasOptions
  | DecorativeCanvasOptions;

export type {
  CanvasPainter,
  CanvasPainterInput
} from '../../renderer/contracts.ts';
