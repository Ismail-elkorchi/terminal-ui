import type { ThemeColor } from './color.ts';

export interface RgbChannels {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// ANSI slots are terminal-configurable. This conventional xterm palette is used only
// when a concrete approximation is required for contrast or color-depth downgrade.
const basicAnsiPalette = Object.freeze([
  rgb(0, 0, 0), rgb(128, 0, 0), rgb(0, 128, 0), rgb(128, 128, 0),
  rgb(0, 0, 128), rgb(128, 0, 128), rgb(0, 128, 128), rgb(192, 192, 192),
  rgb(128, 128, 128), rgb(255, 0, 0), rgb(0, 255, 0), rgb(255, 255, 0),
  rgb(0, 0, 255), rgb(255, 0, 255), rgb(0, 255, 255), rgb(255, 255, 255)
]);

const cubeLevels = Object.freeze([0, 95, 135, 175, 215, 255]);

export function ansi256ToRgb(index: number): RgbChannels {
  const normalized = clampByte(index);
  if (normalized < 16) return basicAnsiColor(normalized);
  if (normalized < 232) {
    const offset = normalized - 16;
    return rgb(
      cubeLevel(Math.floor(offset / 36)),
      cubeLevel(Math.floor(offset % 36 / 6)),
      cubeLevel(offset % 6)
    );
  }
  const level = 8 + (normalized - 232) * 10;
  return rgb(level, level, level);
}

export function ansi256ToBasicAnsi(index: number): number {
  const normalized = clampByte(index);
  return normalized < 16 ? normalized : rgbToBasicAnsi(ansi256ToRgb(normalized));
}

export function rgbToAnsi256(color: RgbChannels): number {
  const normalized = normalizeRgb(color);
  const cube = cubeCandidate(normalized);
  const average = (normalized.r + normalized.g + normalized.b) / 3;
  const grayIndex = Math.max(0, Math.min(23, Math.round((average - 8) / 10)));
  const gray = 232 + grayIndex;
  let best = squaredDistance(normalized, ansi256ToRgb(cube)) <= squaredDistance(normalized, ansi256ToRgb(gray))
    ? cube
    : gray;
  let distance = squaredDistance(normalized, ansi256ToRgb(best));
  for (let index = 0; index < basicAnsiPalette.length; index += 1) {
    const candidate = basicAnsiPalette[index];
    if (candidate === undefined) continue;
    const candidateDistance = squaredDistance(normalized, candidate);
    if (candidateDistance < distance) {
      best = index;
      distance = candidateDistance;
    }
  }
  return best;
}

export function rgbToBasicAnsi(color: RgbChannels): number {
  const normalized = normalizeRgb(color);
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < basicAnsiPalette.length; index += 1) {
    const candidate = basicAnsiPalette[index];
    if (candidate === undefined) continue;
    const candidateDistance = squaredDistance(normalized, candidate);
    if (candidateDistance < distance) {
      best = index;
      distance = candidateDistance;
    }
  }
  return best;
}

export function themeColorToRgb(color: ThemeColor): RgbChannels {
  return color.kind === 'ansi' ? ansi256ToRgb(color.value) : normalizeRgb(color);
}

export function relativeLuminance(color: RgbChannels): number {
  const normalized = normalizeRgb(color);
  return 0.2126 * linear(normalized.r)
    + 0.7152 * linear(normalized.g)
    + 0.0722 * linear(normalized.b);
}

export function contrastRatio(left: RgbChannels, right: RgbChannels): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function cubeCandidate(color: RgbChannels): number {
  return 16 + 36 * nearestLevel(color.r) + 6 * nearestLevel(color.g) + nearestLevel(color.b);
}

function nearestLevel(value: number): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < cubeLevels.length; index += 1) {
    const level = cubeLevels[index];
    if (level === undefined) continue;
    const candidateDistance = Math.abs(value - level);
    if (candidateDistance < distance) {
      best = index;
      distance = candidateDistance;
    }
  }
  return best;
}

function basicAnsiColor(index: number): RgbChannels {
  const color = basicAnsiPalette[index];
  if (color === undefined) throw new RangeError('Basic ANSI color index must be from 0 through 15.');
  return color;
}

function cubeLevel(index: number): number {
  const level = cubeLevels[index];
  if (level === undefined) throw new RangeError('ANSI color cube level must be from 0 through 5.');
  return level;
}

function squaredDistance(left: RgbChannels, right: RgbChannels): number {
  return (left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2;
}

function normalizeRgb(color: RgbChannels): RgbChannels {
  return rgb(clampByte(color.r), clampByte(color.g), clampByte(color.b));
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgb(r: number, g: number, b: number): RgbChannels {
  return Object.freeze({ r, g, b });
}
