import { rasterImagePixels } from '../graphics/raster-image.ts';
import { createGraphicsBudget } from '../graphics/index.ts';
import type { RasterImage } from '../graphics/index.ts';
import type { GraphicsBudget } from '../graphics/index.ts';
import type { ResolvedGraphicGeometry } from './graphics-geometry.ts';

const ESC = '\u001b';
const ST = `${ESC}\\`;
const MAX_PAYLOAD = 4096;
const MAX_CHUNK_BYTES = MAX_PAYLOAD / 4 * 3;

/** @experimental */
export type TerminalGraphicsTransport = 'direct' | 'tmux-passthrough';

/** @experimental */
export function encodeKittyImageUpload(
  image: RasterImage,
  imageId: number,
  transport: TerminalGraphicsTransport,
  suppliedBudget?: GraphicsBudget,
): string {
  const budget = suppliedBudget ?? createGraphicsBudget();
  budget.admitSource(image);
  const pixels = rasterImagePixels(image);
  const chunks: string[] = [];
  let uploadBytes = 0;
  for (let offset = 0; offset < pixels.length; offset += MAX_CHUNK_BYTES) {
    const chunk = base64(pixels.subarray(offset, offset + MAX_CHUNK_BYTES));
    const more = offset + MAX_CHUNK_BYTES < pixels.length ? 1 : 0;
    const command = offset === 0
      ? `a=t,t=d,f=${image.format === 'rgb8' ? '24' : '32'},s=${String(image.width)},v=${String(image.height)},i=${String(imageId)},q=2,m=${String(more)}`
      : `m=${String(more)}`;
    const control = wrapGraphicsControl(`${ESC}_G${command};${chunk}${ST}`, transport);
    uploadBytes += control.length;
    budget.assertUploadBytes(uploadBytes);
    budget.addCommitBytes(control.length);
    chunks.push(control);
  }
  return chunks.join('');
}

/** @experimental */
export function encodeKittyPlacement(
  imageId: number,
  placementId: number,
  geometry: ResolvedGraphicGeometry,
  transport: TerminalGraphicsTransport,
  budget?: GraphicsBudget,
): string {
  const source = geometry.source;
  const destination = geometry.destination;
  const command = [
    'a=p', `i=${String(imageId)}`, `p=${String(placementId)}`,
    `x=${String(source.x)}`, `y=${String(source.y)}`,
    `w=${String(source.width)}`, `h=${String(source.height)}`,
    `c=${String(destination.width)}`, `r=${String(destination.height)}`,
    'C=1', 'z=1', 'q=2',
  ].join(',');
  return admittedControl(
    `${cursorMove(destination.row, destination.column)}${wrapGraphicsControl(`${ESC}_G${command}${ST}`, transport)}`,
    budget,
  );
}

/** @experimental */
export function encodeKittyPlacementDelete(
  imageId: number,
  placementId: number,
  transport: TerminalGraphicsTransport,
  budget?: GraphicsBudget,
): string {
  return admittedControl(wrapGraphicsControl(
    `${ESC}_Ga=d,d=i,i=${String(imageId)},p=${String(placementId)},q=2${ST}`,
    transport,
  ), budget);
}

/** @experimental */
export function encodeKittyImageDelete(
  id: number,
  transport: TerminalGraphicsTransport,
  budget?: GraphicsBudget,
): string {
  return admittedControl(wrapGraphicsControl(`${ESC}_Ga=d,d=I,i=${String(id)},q=2${ST}`, transport), budget);
}

function admittedControl(control: string, suppliedBudget: GraphicsBudget | undefined): string {
  const budget = suppliedBudget ?? createGraphicsBudget();
  budget.addCommitBytes(control.length);
  return control;
}

/** @experimental */
export function wrapGraphicsControl(control: string, transport: TerminalGraphicsTransport): string {
  return transport === 'direct'
    ? control
    : `${ESC}Ptmux;${control.replaceAll(ESC, `${ESC}${ESC}`)}${ST}`;
}

function cursorMove(row: number, column: number): string {
  return `${ESC}[${String(row)};${String(column)}H`;
}

function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;
    result += alphabet[(value >>> 18) & 63] ?? '';
    result += alphabet[(value >>> 12) & 63] ?? '';
    result += index + 1 < bytes.length ? alphabet[(value >>> 6) & 63] ?? '' : '=';
    result += index + 2 < bytes.length ? alphabet[value & 63] ?? '' : '=';
  }
  return result;
}
