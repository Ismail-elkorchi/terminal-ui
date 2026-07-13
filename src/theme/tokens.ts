import type { TerminalSymbols, TerminalSymbolsDefinition } from './symbols.ts';
import type { ThemeColor, ThemeColorToken } from '../visual/color.ts';

export type { CoreColorToken, ThemeColor, ThemeColorToken } from '../visual/color.ts';

export type ThemeColorTokens = Readonly<Record<string, ThemeColor>>;

export interface TerminalSpacingTokens {
  readonly gap: number;
  readonly padding: number;
}

export interface TerminalDesignTokens {
  readonly colors: ThemeColorTokens;
  readonly symbols: TerminalSymbols;
  readonly spacing: TerminalSpacingTokens;
}

export interface TerminalDesignTokenDefinition {
  readonly colors?: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>> | ThemeColorTokens;
  readonly symbols?: TerminalSymbolsDefinition;
  readonly spacing?: Partial<TerminalSpacingTokens>;
}
