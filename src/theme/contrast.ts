import type { ThemeColor } from './index.ts';

const ANSI_RGB: Readonly<Record<number, readonly [number, number, number]>> = {
  0: [0, 0, 0],
  1: [128, 0, 0],
  2: [0, 128, 0],
  3: [128, 128, 0],
  4: [0, 0, 128],
  5: [128, 0, 128],
  6: [0, 128, 128],
  7: [192, 192, 192],
  8: [128, 128, 128],
  9: [255, 0, 0],
  10: [0, 255, 0],
  11: [255, 255, 0],
  12: [0, 0, 255],
  13: [255, 0, 255],
  14: [0, 255, 255],
  15: [255, 255, 255]
};

export function contrastColor(background: ThemeColor): ThemeColor {
  const [r, g, b] = rgbTuple(background);
  return luminance(r, g, b) > 0.45
    ? sameColorFamily(background, 0, 0, 0, 0)
    : sameColorFamily(background, 15, 255, 255, 255);
}

export function ensureContrast(fg: ThemeColor, bg: ThemeColor, minRatio: number): ThemeColor {
  return contrastRatio(fg, bg) >= minRatio ? fg : contrastColor(bg);
}

export function deriveSurface(base: ThemeColor, level: number): ThemeColor {
  const [r, g, b] = rgbTuple(base);
  const amount = Math.max(-10, Math.min(10, Math.floor(level))) * 10;
  const direction = luminance(r, g, b) > 0.45 ? -1 : 1;
  return {
    kind: 'rgb',
    r: clampChannel(r + amount * direction),
    g: clampChannel(g + amount * direction),
    b: clampChannel(b + amount * direction)
  };
}

function contrastRatio(fg: ThemeColor, bg: ThemeColor): number {
  const [fr, fgChannel, fb] = rgbTuple(fg);
  const [br, bgChannel, bb] = rgbTuple(bg);
  const foreground = luminance(fr, fgChannel, fb);
  const background = luminance(br, bgChannel, bb);
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);
  return (lighter + 0.05) / (darker + 0.05);
}

function sameColorFamily(source: ThemeColor, ansi: number, r: number, g: number, b: number): ThemeColor {
  return source.kind === 'ansi'
    ? { kind: 'ansi', value: ansi }
    : { kind: 'rgb', r, g, b };
}

function rgbTuple(color: ThemeColor): readonly [number, number, number] {
  if (color.kind === 'rgb') return [color.r, color.g, color.b];
  return ANSI_RGB[color.value] ?? [255, 255, 255];
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function linear(channel: number): number {
  const value = clampChannel(channel) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
