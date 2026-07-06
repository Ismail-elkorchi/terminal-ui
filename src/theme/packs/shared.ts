import type { TerminalThemeDefinition } from '../theme.ts';
import type { ThemeColor, ThemeColorToken } from '../tokens.ts';

export function rgb(r: number, g: number, b: number): ThemeColor {
  return { kind: 'rgb', r, g, b };
}

export function themePackDefinition(
  name: string,
  colors: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>>
): TerminalThemeDefinition {
  return { name, tokens: { colors: compactColors(colors) } };
}

function compactColors(colors: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>>): Readonly<Record<string, ThemeColor>> {
  const result: Record<string, ThemeColor> = {};
  for (const [token, color] of Object.entries(colors)) {
    if (color !== undefined) result[token] = color;
  }
  return result;
}
