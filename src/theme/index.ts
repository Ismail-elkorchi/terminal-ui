import { adaptiveColors, defaultColors, highContrastColors } from './palettes.ts';
import { asciiSymbols, unicodeSymbols } from './symbols.ts';
import { createTheme, mergeThemes } from './theme.ts';
import type { TerminalTheme, TerminalThemeDefinition } from './theme.ts';

export type {
  CoreColorToken,
  TerminalDesignTokenDefinition,
  TerminalDesignTokens,
  ThemeColor,
  ThemeColorReference,
  ThemeColorToken,
  ThemeColorTokens
} from './tokens.ts';
export { coreColorTokens, isThemeColorToken, themeColor } from './tokens.ts';
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
  resolveThemeColor,
  terminalStyleHasBackground
} from './theme.ts';
export { contrastColor, deriveSurface, ensureContrast } from './contrast.ts';

export const minimalTheme: TerminalTheme = createTheme({
  name: 'minimal',
  tokens: {
    colors: adaptiveColors,
    symbols: asciiSymbols
  }
});

export const highContrastTheme: TerminalTheme = createTheme({
  name: 'highContrast',
  tokens: {
    colors: highContrastColors,
    symbols: asciiSymbols
  }
});

export const noColorTheme: TerminalTheme = createTheme({
  name: 'noColor',
  tokens: {
    colors: {},
    symbols: asciiSymbols
  }
});

export const defaultTheme: TerminalTheme = createTheme({
  name: 'default',
  tokens: {
    colors: defaultColors,
    symbols: unicodeSymbols
  }
});

export const builtInThemes: Readonly<Record<
  'default' | 'minimal' | 'highContrast' | 'noColor',
  TerminalTheme
>> = Object.freeze({
  default: defaultTheme,
  minimal: minimalTheme,
  highContrast: highContrastTheme,
  noColor: noColorTheme
});

export function defineTheme(
  definition: TerminalThemeDefinition = {},
  base: TerminalTheme = defaultTheme
): TerminalTheme {
  return mergeThemes(base, definition);
}
