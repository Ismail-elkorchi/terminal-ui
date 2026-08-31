import { rasterImagePixels } from '../graphics/raster-image.ts';
import { createGraphicsBudget } from '../graphics/index.ts';
import type { RasterImage } from '../graphics/index.ts';
import type { GraphicsBudget } from '../graphics/index.ts';
import type { ResolvedGraphicGeometry } from './graphics-geometry.ts';
import { kittyPlaceholderDiacritic } from './kitty-placeholder-diacritics.ts';

const ESC = '\u001b';
const ST = `${ESC}\\`;
const MAX_PAYLOAD = 4096;
const MAX_CHUNK_BYTES = MAX_PAYLOAD / 4 * 3;
const KITTY_PLACEHOLDER = String.fromCodePoint(0x10eeee);
const utf8Encoder = new TextEncoder();

/** @experimental */
export type KittyGraphicsTransport = 'direct' | 'tmux-passthrough';

/** @experimental */
export function encodeKittyImageUpload(
  image: RasterImage,
  imageId: number,
  transport: KittyGraphicsTransport,
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
    const control = wrapKittyControl(`${ESC}_G${command};${chunk}${ST}`, transport);
    uploadBytes += control.length;
    budget.assertUploadBytes(uploadBytes);
    budget.addCommitBytes(control.length);
    chunks.push(control);
  }
  return chunks.join('');
}

/** @experimental */
export function encodeKittyDirectPlacement(
  imageId: number,
  placementId: number,
  geometry: ResolvedGraphicGeometry,
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
    `${cursorMove(destination.row, destination.column)}${ESC}_G${command}${ST}`,
    budget,
  );
}

/** @experimental */
export function encodeKittyVirtualPlacement(
  imageId: number,
  placementId: number,
  geometry: ResolvedGraphicGeometry,
  transport: KittyGraphicsTransport,
  budget?: GraphicsBudget,
): string {
  const source = geometry.source;
  const destination = geometry.destination;
  const command = [
    'a=p', 'U=1', `i=${String(imageId)}`, `p=${String(placementId)}`,
    `x=${String(source.x)}`, `y=${String(source.y)}`,
    `w=${String(source.width)}`, `h=${String(source.height)}`,
    `c=${String(destination.width)}`, `r=${String(destination.height)}`, 'q=2',
  ].join(',');
  return admittedControl(
    wrapKittyControl(`${ESC}_G${command}${ST}`, transport),
    budget,
  );
}

/** @experimental */
export function encodeKittyUnicodePlaceholder(
  imageId: number,
  placementId: number,
  geometry: ResolvedGraphicGeometry,
  suppliedBudget?: GraphicsBudget,
): string {
  const budget = suppliedBudget ?? createGraphicsBudget();
  const { destination } = geometry;
  const imageColor = sgrColor(imageId);
  const placementColor = sgrColor(placementId);
  const style = `${ESC}[38;2;${imageColor};58;2;${placementColor}m`;
  const reset = `${ESC}[39;59m`;
  const output: string[] = [];
  for (let row = 0; row < destination.height; row += 1) {
    const rowMark = kittyPlaceholderDiacritic(row);
    output.push(cursorMove(destination.row + row, destination.column), style);
    for (let column = 0; column < destination.width; column += 1) {
      output.push(KITTY_PLACEHOLDER, rowMark, kittyPlaceholderDiacritic(column));
    }
    output.push(reset);
  }
  const encoded = output.join('');
  budget.addCommitBytes(utf8Encoder.encode(encoded).byteLength);
  return encoded;
}

/** @experimental */
export function encodeKittyPlacementDelete(
  imageId: number,
  placementId: number,
  transport: KittyGraphicsTransport,
  budget?: GraphicsBudget,
): string {
  return admittedControl(wrapKittyControl(
    `${ESC}_Ga=d,d=i,i=${String(imageId)},p=${String(placementId)},q=2${ST}`,
    transport,
  ), budget);
}

/** @experimental */
export function encodeKittyImageDelete(
  id: number,
  transport: KittyGraphicsTransport,
  budget?: GraphicsBudget,
): string {
  return admittedControl(wrapKittyControl(`${ESC}_Ga=d,d=I,i=${String(id)},q=2${ST}`, transport), budget);
}

function admittedControl(control: string, suppliedBudget: GraphicsBudget | undefined): string {
  const budget = suppliedBudget ?? createGraphicsBudget();
  budget.addCommitBytes(control.length);
  return control;
}

/** @experimental */
export function wrapKittyControl(control: string, transport: KittyGraphicsTransport): string {
  return transport === 'direct'
    ? control
    : `${ESC}Ptmux;${control.replaceAll(ESC, `${ESC}${ESC}`)}${ST}`;
}

function sgrColor(id: number): string {
  if (!Number.isSafeInteger(id) || id < 1 || id > 0xff_ffff) {
    throw new RangeError('Kitty Unicode placeholder IDs must be integers between 1 and 16777215.');
  }
  return `${String(id >>> 16 & 0xff)};${String(id >>> 8 & 0xff)};${String(id & 0xff)}`;
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
