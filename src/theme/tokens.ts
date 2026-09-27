import type { ThemeColor, ThemeColorToken } from '../visual/color.ts';
import type { TerminalSymbols, TerminalSymbolsDefinition } from './symbols.ts';

export { coreColorTokens, isThemeColorToken, themeColor } from '../visual/color.ts';
export type {
  CoreColorToken,
  ThemeColor,
  ThemeColorReference,
  ThemeColorToken,
} from '../visual/color.ts';

export type ThemeColorTokens = Readonly<Partial<Record<ThemeColorToken, ThemeColor>>>;

export interface TerminalDesignTokens {
  readonly colors: ThemeColorTokens;
  readonly symbols: TerminalSymbols;
}

export interface TerminalDesignTokenDefinition {
  readonly colors?: ThemeColorTokens;
  readonly symbols?: TerminalSymbolsDefinition;
}
