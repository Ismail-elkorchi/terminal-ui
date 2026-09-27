

export type RasterPixelFormat = 'rgb8' | 'rgba8';

export interface RasterImageInput {
  readonly width: number;
  readonly height: number;
  readonly format: RasterPixelFormat;
  readonly data: Uint8Array;
}

declare const rasterImageBrand: unique symbol;

export interface RasterImageDescriptor {
  readonly width: number;
  readonly height: number;
  readonly format: RasterPixelFormat;
  readonly byteLength: number;
  readonly contentDigest: string;
}

export interface RasterImage extends RasterImageDescriptor {
  readonly [rasterImageBrand]: true;
}
