import { highContrastColors, modernColors } from './palettes.ts';
import { catppuccinThemeDefinition } from './packs/catppuccin.ts';
import { draculaThemeDefinition } from './packs/dracula.ts';
import { gruvboxThemeDefinition } from './packs/gruvbox.ts';
import { monochromeThemeDefinition } from './packs/monochrome.ts';
import { nordThemeDefinition } from './packs/nord.ts';
import { solarizedThemeDefinition } from './packs/solarized.ts';
import { tokyoNightThemeDefinition } from './packs/tokyo-night.ts';
import { asciiSymbols, unicodeSymbols } from './symbols.ts';
import { createTheme, mergeThemes } from './theme.ts';
import type { TerminalTheme, TerminalThemeDefinition } from './theme.ts';

export type {
  CoreColorToken,
  TerminalDesignTokenDefinition,
  TerminalDesignTokens,
  TerminalSpacingTokens,
  ThemeColor,
  ThemeColorToken,
  ThemeColorTokens
} from './tokens.ts';
export type {
  BorderGlyphSet,
  BorderGlyphSetDefinition,
  TerminalSymbols,
  TerminalSymbolsDefinition
} from './symbols.ts';
export type {
  TerminalTheme,
  TerminalThemeDefinition
} from './theme.ts';

export { asciiSymbols, unicodeSymbols } from './symbols.ts';
export {
  createTheme,
  isTerminalTheme,
  mergeDesignTokens,
  mergeThemes,
  resolveTerminalStyle,
  resolveThemeColor
} from './theme.ts';
export { contrastColor, deriveSurface, ensureContrast } from './contrast.ts';

export const minimalTheme: TerminalTheme = createTheme({
  name: 'minimal',
  tokens: {
    colors: {},
    symbols: asciiSymbols,
    spacing: { gap: 1, padding: 0 }
  }
});

export const modernTheme: TerminalTheme = createTheme({
  name: 'modern',
  tokens: {
    colors: modernColors,
    symbols: unicodeSymbols,
    spacing: { gap: 1, padding: 0 }
  }
});

export const compactTheme: TerminalTheme = createTheme({
  name: 'compact',
  tokens: {
    colors: modernColors,
    symbols: asciiSymbols,
    spacing: { gap: 0, padding: 0 }
  }
});

export const highContrastTheme: TerminalTheme = createTheme({
  name: 'highContrast',
  tokens: {
    colors: highContrastColors,
    symbols: asciiSymbols,
    spacing: { gap: 1, padding: 0 }
  }
});

export const noColorTheme: TerminalTheme = createTheme({
  name: 'noColor',
  tokens: {
    colors: {},
    symbols: asciiSymbols,
    spacing: { gap: 1, padding: 0 }
  }
});

export const defaultTheme: TerminalTheme = modernTheme;

export const defaultThemes = {
  minimal: minimalTheme,
  modern: modernTheme,
  compact: compactTheme,
  highContrast: highContrastTheme,
  noColor: noColorTheme
} as const;

export function defineTheme(
  definition: TerminalThemeDefinition = {},
  base: TerminalTheme = defaultTheme
): TerminalTheme {
  return mergeThemes(base, definition);
}

export const catppuccinTheme: TerminalTheme = defineTheme(catppuccinThemeDefinition, modernTheme);
export const nordTheme: TerminalTheme = defineTheme(nordThemeDefinition, modernTheme);
export const tokyoNightTheme: TerminalTheme = defineTheme(tokyoNightThemeDefinition, modernTheme);
export const solarizedTheme: TerminalTheme = defineTheme(solarizedThemeDefinition, modernTheme);
export const gruvboxTheme: TerminalTheme = defineTheme(gruvboxThemeDefinition, modernTheme);
export const draculaTheme: TerminalTheme = defineTheme(draculaThemeDefinition, modernTheme);
export const monochromeTheme: TerminalTheme = defineTheme(monochromeThemeDefinition, modernTheme);

export const themePacks = {
  catppuccin: catppuccinTheme,
  nord: nordTheme,
  tokyoNight: tokyoNightTheme,
  solarized: solarizedTheme,
  gruvbox: gruvboxTheme,
  dracula: draculaTheme,
  monochrome: monochromeTheme
} as const;
