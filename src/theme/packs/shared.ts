import type { TerminalThemeDefinition, ThemeColor, ThemeToken } from '../index.ts';

export function rgb(r: number, g: number, b: number): ThemeColor {
  return { kind: 'rgb', r, g, b };
}

export function themePackDefinition(
  name: string,
  colors: Readonly<Partial<Record<ThemeToken, ThemeColor>>>
): TerminalThemeDefinition {
  return { name, colors: compactColors(colors) };
}

function compactColors(colors: Readonly<Partial<Record<ThemeToken, ThemeColor>>>): Readonly<Record<string, ThemeColor>> {
  const result: Record<string, ThemeColor> = {};
  for (const [token, color] of Object.entries(colors)) {
    if (color !== undefined) result[token] = color;
  }
  return result;
}
