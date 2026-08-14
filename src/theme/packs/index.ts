import { defineTheme } from '../index.ts';
import { catppuccinMochaThemeDefinition } from './catppuccin.ts';
import { draculaThemeDefinition } from './dracula.ts';
import { gruvboxDarkThemeDefinition } from './gruvbox.ts';
import { monochromeThemeDefinition } from './monochrome.ts';
import { nordThemeDefinition } from './nord.ts';
import { solarizedDarkThemeDefinition } from './solarized.ts';
import { tokyoNightThemeDefinition } from './tokyo-night.ts';
import type { TerminalTheme } from '../index.ts';

export const catppuccinMochaTheme: TerminalTheme = defineTheme(catppuccinMochaThemeDefinition);
export const nordTheme: TerminalTheme = defineTheme(nordThemeDefinition);
export const tokyoNightTheme: TerminalTheme = defineTheme(tokyoNightThemeDefinition);
export const solarizedDarkTheme: TerminalTheme = defineTheme(solarizedDarkThemeDefinition);
export const gruvboxDarkTheme: TerminalTheme = defineTheme(gruvboxDarkThemeDefinition);
export const draculaTheme: TerminalTheme = defineTheme(draculaThemeDefinition);
export const monochromeTheme: TerminalTheme = defineTheme(monochromeThemeDefinition);

export const themePacks: Readonly<Record<
  | 'catppuccinMocha'
  | 'nord'
  | 'tokyoNight'
  | 'solarizedDark'
  | 'gruvboxDark'
  | 'dracula'
  | 'monochrome',
  TerminalTheme
>> = Object.freeze({
  catppuccinMocha: catppuccinMochaTheme,
  nord: nordTheme,
  tokyoNight: tokyoNightTheme,
  solarizedDark: solarizedDarkTheme,
  gruvboxDark: gruvboxDarkTheme,
  dracula: draculaTheme,
  monochrome: monochromeTheme
});
