import type { ComponentMetadataOptions } from '../../component/index.ts';
import type {
  CanvasPainter,
  Measurement
} from '../../renderer/contracts.ts';
import type { CanvasStylePart } from '../style-parts.ts';
import type { ImageStylePart } from '../style-parts.ts';
import type { ImageFit, RasterImage } from '../../graphics/index.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

interface CanvasOptionsBase {
  readonly id?: string;
  readonly painter: CanvasPainter;
  readonly measurement: Measurement;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<CanvasStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
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
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ImageStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

/** @experimental */
export interface SemanticImageOptions extends ImageOptionsBase {
  readonly decorative?: false;
  readonly label: string;
}

/** @experimental */
export interface DecorativeImageOptions extends ImageOptionsBase {
  readonly decorative: true;
  readonly label?: never;
}

/** @experimental */
export type ImageOptions = SemanticImageOptions | DecorativeImageOptions;

export type {
  CanvasPainter,
  CanvasPainterInput
} from '../../renderer/contracts.ts';
