import type { Rect } from '../geometry/types.ts';
import type { RasterImage, RasterImageDescriptor } from './raster-image.ts';

export type ImageFit = 'contain' | 'cover' | 'fill';
export type TerminalGraphicsMode = 'auto' | 'kitty' | 'sixel' | 'none';

export interface GraphicPlacementInput {
  readonly id: string;
  readonly image: RasterImage;
  readonly bounds: Rect;
  readonly clip?: Rect;
  readonly fit: ImageFit;
}

export interface GraphicPlacement extends GraphicPlacementDescriptor {
  readonly image: RasterImage;
  readonly clip: Rect;
}

export interface GraphicPlacementDescriptor {
  readonly id: string;
  readonly image: RasterImageDescriptor;
  readonly bounds: Rect;
  readonly clip: Rect;
  readonly fit: ImageFit;
}

export type GraphicOperation =
  | { readonly kind: 'place'; readonly placement: GraphicPlacement }
  | { readonly kind: 'remove'; readonly id: string };

export type GraphicOperationDescriptor =
  | { readonly kind: 'place'; readonly placement: GraphicPlacementDescriptor }
  | { readonly kind: 'remove'; readonly id: string };
