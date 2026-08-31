import { rasterImage } from '../graphics/index.ts';
import { rasterImagePixels } from '../graphics/raster-image.ts';
import type { GraphicsBudgetLimits, RasterImage } from '../graphics/index.ts';
import type { ResolvedGraphicGeometry } from './graphics-geometry.ts';

export function resampleRasterRegion(
  image: RasterImage,
  source: ResolvedGraphicGeometry['source'],
  width: number,
  height: number,
  budgetLimits: GraphicsBudgetLimits,
): RasterImage {
  const channels = image.format === 'rgb8' ? 3 : 4;
  const input = rasterImagePixels(image);
  const output = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const sourceY = source.y + Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = source.x + Math.min(source.width - 1, Math.floor(x * source.width / width));
      const inputOffset = (sourceY * image.width + sourceX) * channels;
      const outputOffset = (y * width + x) * channels;
      output.set(input.subarray(inputOffset, inputOffset + channels), outputOffset);
    }
  }
  return rasterImage({ width, height, format: image.format, data: output }, budgetLimits);
}
