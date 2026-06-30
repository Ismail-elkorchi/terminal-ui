import { catppuccinTheme, highContrastTheme, noColorTheme, tokyoNightTheme } from '@ismail-elkorchi/terminal-ui/theme';

import { themeSequence } from './state.mjs';

export function showcaseTheme(state) {
  const name = themeLabel(state);
  if (name === 'catppuccin') return catppuccinTheme;
  if (name === 'tokyoNight') return tokyoNightTheme;
  if (name === 'highContrast') return highContrastTheme;
  if (name === 'noColor') return noColorTheme;
  return catppuccinTheme;
}

export function themeLabel(state) {
  return themeSequence[state.themeIndex % themeSequence.length] ?? 'catppuccin';
}

export function themeIndexFor(value) {
  const index = themeSequence.findIndex((item) => item === value);
  return index < 0 ? 0 : index;
}

export function nextThemeState(state) {
  const next = { ...state, themeIndex: state.themeIndex + 1 };
  return {
    ...next,
    lastAction: `Theme changed to ${themeLabel(next)}; chart, map, and focus tones updated.`
  };
}
