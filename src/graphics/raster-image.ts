import { isNonArrayObject } from '../foundation/validation.ts';

export type RasterPixelFormat = 'rgb8' | 'rgba8';

export interface RasterImageInput {
  readonly width: number;
  readonly height: number;
  readonly format: RasterPixelFormat;
  readonly data: Uint8Array;
}

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly format: RasterPixelFormat;
  readonly byteLength: number;
  readonly contentFingerprint: string;
}

const pixelsByImage = new WeakMap<object, Uint8Array>();

export function rasterImage(input: RasterImageInput): RasterImage;
export function rasterImage(input: unknown): RasterImage {
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
  if (data.byteLength !== expectedLength) {
    throw new RangeError(`Raster image data must contain exactly ${String(expectedLength)} bytes.`);
  }
  const owned = Uint8Array.from(data);
  const image = Object.freeze({
    width,
    height,
    format,
    byteLength: owned.byteLength,
    contentFingerprint: rasterFingerprint(width, height, format, owned),
  });
  pixelsByImage.set(image, owned);
  return image;
}

export function isRasterImage(value: unknown): value is RasterImage {
  return isNonArrayObject(value) && pixelsByImage.has(value);
}

/** Framework-owned pixel access for protocol encoders. */
export function rasterImagePixels(image: RasterImage): Uint8Array {
  const pixels = pixelsByImage.get(image);
  if (pixels === undefined) throw new TypeError('Raster image must be created by rasterImage().');
  return pixels;
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RangeError(`Raster image ${field} must be a positive safe integer.`);
  }
  return value as number;
}

function rasterFingerprint(
  width: number,
  height: number,
  format: RasterPixelFormat,
  data: Uint8Array,
): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  first = hashInteger(first, width);
  first = hashInteger(first, height);
  first = hashInteger(first, format === 'rgb8' ? 3 : 4);
  second = hashInteger(second, height);
  second = hashInteger(second, width);
  second = hashInteger(second, format === 'rgb8' ? 3 : 4);
  for (const byte of data) {
    first = Math.imul((first ^ byte) >>> 0, 0x01000193) >>> 0;
    second = Math.imul((second ^ byte) >>> 0, 0x85ebca6b) >>> 0;
  }
  return `raster:${hex(first)}${hex(second)}`;
}

function hashInteger(hash: number, value: number): number {
  let next = hash;
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    next = Math.imul((next ^ (remaining & 0xff)) >>> 0, 0x01000193) >>> 0;
    remaining = Math.floor(remaining / 256);
  }
  return next;
}

function hex(value: number): string {
  return value.toString(16).padStart(8, '0');
}
