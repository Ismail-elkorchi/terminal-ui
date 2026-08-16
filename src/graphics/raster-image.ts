import { isNonArrayObject } from '../foundation/validation.ts';
import { sha256ContentHex } from '../diagnostic-identity.ts';
import { createGraphicsBudget } from './budget.ts';
import type { GraphicsBudgetLimits } from './budget.ts';

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

const pixelsByImage = new WeakMap<object, Uint8Array>();

export function rasterImage(input: RasterImageInput, limits?: Partial<GraphicsBudgetLimits>): RasterImage;
export function rasterImage(input: unknown, limits?: unknown): RasterImage {
  if (!isNonArrayObject(input)) throw new TypeError('Raster image input must be an object.');
  const width = positiveSafeInteger(input['width'], 'width');
  const height = positiveSafeInteger(input['height'], 'height');
  const format = input['format'];
  if (format !== 'rgb8' && format !== 'rgba8') {
    throw new TypeError("Raster image format must be 'rgb8' or 'rgba8'.");
  }
  const data = input['data'];
  if (!(data instanceof Uint8Array)) throw new TypeError('Raster image data must be a Uint8Array.');
  const channels = format === 'rgb8' ? 3 : 4;
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels)) throw new RangeError('Raster image dimensions are too large.');
  const expectedLength = pixels * channels;
  if (!Number.isSafeInteger(expectedLength)) throw new RangeError('Raster image byte length is too large.');
  createGraphicsBudget(limits).admitSource({
    width,
    height,
    format,
    byteLength: expectedLength,
    contentDigest: '',
  });
  if (data.byteLength !== expectedLength) {
    throw new RangeError(`Raster image data must contain exactly ${String(expectedLength)} bytes.`);
  }
  const owned = Uint8Array.from(data);
  const image = Object.freeze({
    width,
    height,
    format,
    byteLength: owned.byteLength,
    contentDigest: rasterDigest(width, height, format, owned),
  }) as RasterImage;
  pixelsByImage.set(image, owned);
  return image;
}

export function isRasterImage(value: unknown): value is RasterImage {
  return pixelsByImage.has(value as object);
}

/** Framework-owned pixel access for protocol encoders. */
export function rasterImagePixels(image: RasterImage): Uint8Array {
  const pixels = pixelsByImage.get(image);
  if (pixels === undefined) throw new TypeError('Raster image must be created by rasterImage().');
  return pixels;
}

export function rasterImageResourceKey(image: RasterImageDescriptor): string {
  return [
    image.contentDigest,
    String(image.width),
    String(image.height),
    image.format,
    String(image.byteLength),
  ].join(':');
}

export function sameRasterImageContent(
  left: RasterImageDescriptor,
  right: RasterImageDescriptor,
): boolean {
  return rasterImageResourceKey(left) === rasterImageResourceKey(right);
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RangeError(`Raster image ${field} must be a positive safe integer.`);
  }
  return value as number;
}

function rasterDigest(
  width: number,
  height: number,
  format: RasterPixelFormat,
  data: Uint8Array,
): string {
  return `raster:sha256:${sha256ContentHex([
    `terminal-ui-raster-v1\0${String(width)}\0${String(height)}\0${format}\0`,
    data,
  ])}`;
}
