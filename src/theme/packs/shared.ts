import type { TerminalThemeDefinition } from '../theme.ts';
import type { ThemeColor, ThemeColorToken } from '../tokens.ts';
import { contrastColor } from '../contrast.ts';

export function rgb(r: number, g: number, b: number): ThemeColor {
  return { kind: 'rgb', r, g, b };
}

export function themePackDefinition(
  name: string,
  colors: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>>
): TerminalThemeDefinition {
  return { name, tokens: { colors: compactColors({ ...derivedChrome(colors), ...colors }) } };
}

function derivedChrome(
  colors: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>>
): Readonly<Partial<Record<ThemeColorToken, ThemeColor>>> {
  const app = colors['app.background'];
  const raised = colors['surface.raised.background'];
  const selected = colors['surface.selected.background'];
  const border = colors['surface.border'];
  const raisedBorder = colors['surface.raised.border'] ?? border;
  const inset = colors['surface.inset.background'];
  const text = colors['text.default'];
  const strong = colors['text.strong'] ?? text;
  const muted = colors['text.muted'];
  const accent = colors['accent.primary'];
  return {
    ...(app === undefined ? {} : { 'surface.backdrop': app }),
    ...(selected === undefined ? {} : { 'focus.background': selected }),
    ...(raised === undefined ? {} : {
      'control.background': raised,
      'control.secondary.background': selected ?? raised
    }),
    ...(text === undefined ? {} : {
      'control.foreground': text,
      'control.secondary.foreground': text
    }),
    ...(border === undefined ? {} : {
      'control.border': border,
      'scrollbar.track': border
    }),
    ...(raisedBorder === undefined ? {} : { 'control.secondary.border': raisedBorder }),
    ...(accent === undefined ? {} : {
      'control.primary.background': accent,
      'control.primary.border': accent,
      'tab.indicator': accent,
      'badge.background': accent
    }),
    ...(accent === undefined ? {} : {
      'control.primary.foreground': contrastColor(accent),
      'badge.foreground': contrastColor(accent)
    }),
    ...(strong === undefined ? {} : {
      'tab.active.foreground': strong,
      'keyHint.foreground': strong
    }),
    ...(muted === undefined ? {} : {
      'tab.inactive.foreground': muted,
      'scrollbar.thumb': muted
    }),
    ...(inset === undefined ? {} : { 'keyHint.background': inset })
  };
}

function compactColors(colors: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>>): Readonly<Record<string, ThemeColor>> {
  const result: Record<string, ThemeColor> = {};
  for (const [token, color] of Object.entries(colors)) {
    if (color !== undefined) result[token] = color;
  }
  return result;
}
