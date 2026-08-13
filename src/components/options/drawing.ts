import type { ComponentMetadataOptions } from '../../component/index.ts';
import type {
  CanvasPainter,
  Measurement
} from '../../renderer/contracts.ts';
import type { CanvasStylePart } from '../../ui-model/style-parts.ts';
import type { ImageStylePart } from '../../ui-model/style-parts.ts';
import type { ImageFit, RasterImage } from '../../graphics/index.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

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

interface ImageOptionsBase {
  readonly id?: string;
  readonly image: RasterImage;
  readonly measurement: Measurement;
  readonly fit?: ImageFit;
  readonly fallback?: string | InlineContent;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], ImageStylePart>;
}

export interface SemanticImageOptions extends ImageOptionsBase {
  readonly decorative?: false;
  readonly label: string;
}

export interface DecorativeImageOptions extends ImageOptionsBase {
  readonly decorative: true;
  readonly label?: never;
}

export type ImageOptions = SemanticImageOptions | DecorativeImageOptions;

export type {
  CanvasPainter,
  CanvasPainterInput
} from '../../renderer/contracts.ts';
