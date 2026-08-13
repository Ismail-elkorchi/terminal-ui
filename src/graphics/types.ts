import type { Rect } from '../geometry/types.ts';
import type { RasterImage } from './raster-image.ts';

export type ImageFit = 'contain' | 'cover' | 'fill';
export type TerminalGraphicsMode = 'auto' | 'kitty' | 'sixel' | 'none';

export interface GraphicPlacementInput {
  readonly id: string;
  readonly image: RasterImage;
  readonly bounds: Rect;
  readonly clip?: Rect;
  readonly fit: ImageFit;
}

export interface GraphicPlacement extends GraphicPlacementInput {
  readonly clip: Rect;
}

export type GraphicOperation =
  | { readonly kind: 'place'; readonly placement: GraphicPlacement }
  | { readonly kind: 'remove'; readonly id: string };
