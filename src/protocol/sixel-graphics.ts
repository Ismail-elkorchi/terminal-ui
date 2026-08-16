import { rasterImagePixels } from '../graphics/raster-image.ts';
import { createGraphicsBudget } from '../graphics/index.ts';
import type { RasterImage } from '../graphics/index.ts';
import type { GraphicsBudget } from '../graphics/index.ts';
import type { ResolvedGraphicGeometry, TerminalCellPixels } from './graphics-geometry.ts';
import { wrapGraphicsControl } from './kitty-graphics.ts';
import type { TerminalGraphicsTransport } from './kitty-graphics.ts';

const ESC = '\u001b';
const ST = `${ESC}\\`;

/** @experimental */
export interface RgbColor { readonly r: number; readonly g: number; readonly b: number }

/** @experimental */
export function encodeSixelImage(
  image: RasterImage,
  geometry: ResolvedGraphicGeometry,
  cellPixels: TerminalCellPixels,
  background: RgbColor | undefined,
  transport: TerminalGraphicsTransport,
  suppliedBudget?: GraphicsBudget,
): string {
  const budget = suppliedBudget ?? createGraphicsBudget();
  budget.admitSource(image);
  budget.admitCellPixels(cellPixels);
  const width = geometry.destination.width * cellPixels.width;
  const height = geometry.destination.height * cellPixels.height;
  budget.admitFittedPixels(width, height);
  const indexes = resampleAndQuantize(image, geometry.source, width, height, background);
  const used = [...new Set(indexes)].filter((index) => index !== transparentIndex)
    .toSorted((left, right) => left - right);
  const palette = used.map((index) => {
    const color = cubeColor(index);
    return `#${String(index)};2;${String(percent(color.r))};${String(percent(color.g))};${String(percent(color.b))}`;
  }).join('');
  const move = `${ESC}[${String(geometry.destination.row)};${String(geometry.destination.column)}H`;
  const header = `${move}${ESC}P0;${background === undefined ? '1' : '0'}q"1;1;${String(width)};${String(height)}${palette}`;
  const parts: string[] = [];
  let directBytes = 0;
  append(header);
  for (let top = 0; top < height; top += 6) {
    if (top > 0) append('-');
    const bandEnd = Math.min(height, top + 6) * width;
    const bandColors = [...new Set(indexes.subarray(top * width, bandEnd))]
      .filter((index) => index !== transparentIndex)
      .toSorted((left, right) => left - right);
    for (const [colorIndex, color] of bandColors.entries()) {
      if (colorIndex > 0) append('$');
      const sixels: string[] = [];
      for (let x = 0; x < width; x += 1) {
        let bits = 0;
        for (let bit = 0; bit < 6; bit += 1) {
          const y = top + bit;
          if (y < height && indexes[y * width + x] === color) bits |= 1 << bit;
        }
        sixels.push(String.fromCharCode(63 + bits));
      }
      append(`#${String(color)}${runLengthEncode(sixels)}`);
    }
  }
  append(ST);
  const direct = parts.join('');
  const encoded = transport === 'direct' ? direct : wrapGraphicsControl(direct.slice(move.length), transport);
  const output = transport === 'direct' ? encoded : `${move}${encoded}`;
  budget.assertUploadBytes(output.length);
  budget.addCommitBytes(output.length);
  return output;

  function append(part: string): void {
    directBytes += part.length;
    budget.assertUploadBytes(transport === 'direct' ? directBytes : directBytes + 16);
    parts.push(part);
  }
}

function resampleAndQuantize(
  image: RasterImage,
  source: ResolvedGraphicGeometry['source'],
  width: number,
  height: number,
  background: RgbColor | undefined,
): Uint8Array {
  const input = rasterImagePixels(image);
  const channels = image.format === 'rgb8' ? 3 : 4;
  const output = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = source.y + Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = source.x + Math.min(source.width - 1, Math.floor(x * source.width / width));
      const offset = (sourceY * image.width + sourceX) * channels;
      const alpha = channels === 4 ? (input[offset + 3] ?? 0) / 255 : 1;
      if (background === undefined && alpha === 0) {
        output[y * width + x] = transparentIndex;
        continue;
      }
      if (background === undefined && alpha < 1) {
        throw new Error('Partially transparent SIXEL images require an explicit RGB app.background theme color.');
      }
      const r = composite(input[offset] ?? 0, background?.r, alpha);
      const g = composite(input[offset + 1] ?? 0, background?.g, alpha);
      const b = composite(input[offset + 2] ?? 0, background?.b, alpha);
      output[y * width + x] = cubeIndex(r, g, b);
    }
  }
  return output;
}

function cubeIndex(r: number, g: number, b: number): number {
  return quantizeChannel(r) * 36 + quantizeChannel(g) * 6 + quantizeChannel(b);
}

function cubeColor(index: number): RgbColor {
  return { r: Math.floor(index / 36) * 51, g: Math.floor(index % 36 / 6) * 51, b: index % 6 * 51 };
}

function quantizeChannel(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value / 51)));
}

const transparentIndex = 255;

function composite(foreground: number, background: number | undefined, alpha: number): number {
  return background === undefined
    ? foreground
    : Math.round(foreground * alpha + background * (1 - alpha));
}

function percent(value: number): number {
  return Math.round(value * 100 / 255);
}

function runLengthEncode(values: readonly string[]): string {
  let output = '';
  let index = 0;
  while (index < values.length) {
    const value = values[index] ?? '?';
    let end = index + 1;
    while (end < values.length && values[end] === value) end += 1;
    const count = end - index;
    output += count >= 4 ? `!${String(count)}${value}` : value.repeat(count);
    index = end;
  }
  return output;
}
