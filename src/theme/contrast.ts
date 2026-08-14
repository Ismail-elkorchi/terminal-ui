import {
  contrastRatio,
  relativeLuminance,
  themeColorToRgb
} from '../visual/color-conversion.ts';
import type { ThemeColor } from './tokens.ts';

export function contrastColor(background: ThemeColor): ThemeColor;
export function contrastColor(background: unknown): ThemeColor {
  const normalized = validateThemeColor(background, 'Background color');
  return contrastingColor(normalized);
}

function contrastingColor(background: ThemeColor): ThemeColor {
  const color = themeColorToRgb(background);
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  return contrastRatio(color, black) >= contrastRatio(color, white)
    ? sameColorFamily(background, 0, 0, 0, 0)
    : sameColorFamily(background, 15, 255, 255, 255);
}

export function ensureContrast(fg: ThemeColor, bg: ThemeColor, minRatio: number): ThemeColor;
export function ensureContrast(fg: unknown, bg: unknown, minRatio: unknown): ThemeColor {
  const foreground = validateThemeColor(fg, 'Foreground color');
  const background = validateThemeColor(bg, 'Background color');
  if (typeof minRatio !== 'number' || !Number.isFinite(minRatio) || minRatio < 1 || minRatio > 21) {
    throw new RangeError('Minimum contrast ratio must be a finite number from 1 through 21.');
  }
  const foregroundRgb = themeColorToRgb(foreground);
  const backgroundRgb = themeColorToRgb(background);
  if (contrastRatio(foregroundRgb, backgroundRgb) >= minRatio) return foreground;
  const target = contrastingColor(background);
  if (contrastRatio(themeColorToRgb(target), backgroundRgb) < minRatio) {
    throw new RangeError(`The requested contrast ratio ${String(minRatio)} cannot be satisfied with black or white.`);
  }
  if (foreground.kind === 'ansi') return target;
  const targetRgb = themeColorToRgb(target);
  let lower = 0;
  let upper = 1;
  let replacement = targetRgb;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const amount = (lower + upper) / 2;
    const candidate = {
      r: blend(foreground.r, targetRgb.r, amount),
      g: blend(foreground.g, targetRgb.g, amount),
      b: blend(foreground.b, targetRgb.b, amount)
    };
    if (contrastRatio(candidate, backgroundRgb) >= minRatio) {
      replacement = candidate;
      upper = amount;
    } else {
      lower = amount;
    }
  }
  return { kind: 'rgb', ...replacement };
}

export function deriveSurface(base: ThemeColor, level: number): ThemeColor;
export function deriveSurface(base: unknown, level: unknown): ThemeColor {
  const color = validateThemeColor(base, 'Surface color');
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    throw new RangeError('Surface level must be finite.');
  }
  const { r, g, b } = themeColorToRgb(color);
  const amount = Math.max(-10, Math.min(10, Math.floor(level))) * 10;
  const direction = relativeLuminance({ r, g, b }) > 0.45 ? -1 : 1;
  return {
    kind: 'rgb',
    r: clampChannel(r + amount * direction),
    g: clampChannel(g + amount * direction),
    b: clampChannel(b + amount * direction)
  };
}

function sameColorFamily(source: ThemeColor, ansi: number, r: number, g: number, b: number): ThemeColor {
  return source.kind === 'ansi'
    ? { kind: 'ansi', value: ansi }
    : { kind: 'rgb', r, g, b };
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function blend(from: number, to: number, amount: number): number {
  return clampChannel(from + (to - from) * amount);
}

function validateThemeColor(value: unknown, subject: string): ThemeColor {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${subject} must be a color.`);
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate['kind'] === 'ansi') {
    const index = candidate['value'];
    if (!channel(index)) throw new RangeError(`${subject} ANSI index must be an integer from 0 through 255.`);
    return { kind: 'ansi', value: index };
  }
  if (candidate['kind'] === 'rgb') {
    const r = candidate['r'];
    const g = candidate['g'];
    const b = candidate['b'];
    if (!channel(r) || !channel(g) || !channel(b)) {
      throw new RangeError(`${subject} RGB channels must be integers from 0 through 255.`);
    }
    return { kind: 'rgb', r, g, b };
  }
  throw new TypeError(`${subject} must be an ANSI or RGB color.`);
}

function channel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}
