import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalStyle } from '../tui/render-primitives.ts';

export type CoreThemeToken =
  | 'app.background'
  | 'app.foreground'
  | 'surface.background'
  | 'surface.foreground'
  | 'surface.border'
  | 'surface.title'
  | 'text.default'
  | 'text.muted'
  | 'text.strong'
  | 'text.disabled'
  | 'accent.primary'
  | 'accent.secondary'
  | 'status.info'
  | 'status.success'
  | 'status.warning'
  | 'status.error'
  | 'status.pending'
  | 'status.running'
  | 'selection.background'
  | 'selection.foreground'
  | 'focus.border'
  | 'focus.background'
  | 'input.cursor'
  | 'input.placeholder'
  | 'menu.match'
  | 'menu.selected'
  | 'table.header'
  | 'table.border'
  | 'tree.branch'
  | 'scrollbar.track'
  | 'scrollbar.thumb'
  | 'diff.add'
  | 'diff.remove'
  | 'diff.context'
  | 'chart.series.1'
  | 'chart.series.2'
  | 'chart.series.3';

export type ThemeToken = CoreThemeToken | (string & {});

export type ThemeColor =
  | { readonly kind: 'ansi'; readonly value: number }
  | { readonly kind: 'rgb'; readonly r: number; readonly g: number; readonly b: number };

export interface BorderGlyphSet {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

export interface TerminalSymbols {
  readonly borderSingle: BorderGlyphSet;
  readonly borderRounded: BorderGlyphSet;
  readonly treeExpanded: string;
  readonly treeCollapsed: string;
  readonly pointer: string;
  readonly selected: string;
  readonly unselected: string;
  readonly checkboxChecked: string;
  readonly checkboxUnchecked: string;
  readonly radioChecked: string;
  readonly radioUnchecked: string;
  readonly statusError: string;
  readonly statusWarning: string;
  readonly statusInfo: string;
  readonly statusSuccess: string;
  readonly progressFilled: string;
  readonly progressEmpty: string;
  readonly collapsed: string;
  readonly expanded: string;
}

export interface TerminalSpacing {
  readonly gap: number;
  readonly padding: number;
}

export interface TerminalTheme {
  readonly name: string;
  readonly colors: Readonly<Record<string, ThemeColor>>;
  readonly symbols: TerminalSymbols;
  readonly spacing: TerminalSpacing;
}

export interface BorderGlyphSetDefinition {
  readonly topLeft?: string;
  readonly topRight?: string;
  readonly bottomLeft?: string;
  readonly bottomRight?: string;
  readonly horizontal?: string;
  readonly vertical?: string;
}

export interface TerminalSymbolsDefinition {
  readonly borderSingle?: BorderGlyphSetDefinition;
  readonly borderRounded?: BorderGlyphSetDefinition;
  readonly treeExpanded?: string;
  readonly treeCollapsed?: string;
  readonly pointer?: string;
  readonly selected?: string;
  readonly unselected?: string;
  readonly checkboxChecked?: string;
  readonly checkboxUnchecked?: string;
  readonly radioChecked?: string;
  readonly radioUnchecked?: string;
  readonly statusError?: string;
  readonly statusWarning?: string;
  readonly statusInfo?: string;
  readonly statusSuccess?: string;
  readonly progressFilled?: string;
  readonly progressEmpty?: string;
  readonly collapsed?: string;
  readonly expanded?: string;
}

export interface TerminalThemeDefinition {
  readonly name?: string;
  readonly colors?: Readonly<Record<string, ThemeColor>>;
  readonly symbols?: TerminalSymbolsDefinition;
  readonly spacing?: Partial<TerminalSpacing>;
}

export const asciiSymbols: TerminalSymbols = {
  borderSingle: { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' },
  borderRounded: { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' },
  treeExpanded: 'v',
  treeCollapsed: '>',
  pointer: '>',
  selected: '*',
  unselected: ' ',
  checkboxChecked: '[x]',
  checkboxUnchecked: '[ ]',
  radioChecked: '(*)',
  radioUnchecked: '( )',
  statusError: 'x',
  statusWarning: '!',
  statusInfo: 'i',
  statusSuccess: '+',
  progressFilled: '#',
  progressEmpty: '-',
  collapsed: '[+]',
  expanded: '[-]'
};

export const unicodeSymbols: TerminalSymbols = {
  borderSingle: { topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', horizontal: '─', vertical: '│' },
  borderRounded: { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', horizontal: '─', vertical: '│' },
  treeExpanded: '▾',
  treeCollapsed: '▸',
  pointer: '›',
  selected: '●',
  unselected: ' ',
  checkboxChecked: '[x]',
  checkboxUnchecked: '[ ]',
  radioChecked: '(*)',
  radioUnchecked: '( )',
  statusError: '×',
  statusWarning: '!',
  statusInfo: 'i',
  statusSuccess: '✓',
  progressFilled: '█',
  progressEmpty: '░',
  collapsed: '[+]',
  expanded: '[-]'
};

const modernColors = {
  'app.background': { kind: 'ansi', value: 0 },
  'app.foreground': { kind: 'ansi', value: 15 },
  'surface.background': { kind: 'ansi', value: 0 },
  'surface.foreground': { kind: 'ansi', value: 15 },
  'surface.border': { kind: 'ansi', value: 8 },
  'surface.title': { kind: 'ansi', value: 14 },
  'text.default': { kind: 'ansi', value: 15 },
  'text.muted': { kind: 'ansi', value: 8 },
  'text.strong': { kind: 'ansi', value: 15 },
  'text.disabled': { kind: 'ansi', value: 8 },
  'accent.primary': { kind: 'ansi', value: 13 },
  'accent.secondary': { kind: 'ansi', value: 12 },
  'status.info': { kind: 'ansi', value: 14 },
  'status.success': { kind: 'ansi', value: 10 },
  'status.warning': { kind: 'ansi', value: 11 },
  'status.error': { kind: 'ansi', value: 9 },
  'status.pending': { kind: 'ansi', value: 8 },
  'status.running': { kind: 'ansi', value: 14 },
  'selection.background': { kind: 'ansi', value: 4 },
  'selection.foreground': { kind: 'ansi', value: 15 },
  'focus.border': { kind: 'ansi', value: 14 },
  'focus.background': { kind: 'ansi', value: 4 },
  'input.cursor': { kind: 'ansi', value: 15 },
  'input.placeholder': { kind: 'ansi', value: 8 },
  'menu.match': { kind: 'ansi', value: 13 },
  'menu.selected': { kind: 'ansi', value: 14 },
  'table.header': { kind: 'ansi', value: 14 },
  'table.border': { kind: 'ansi', value: 8 },
  'tree.branch': { kind: 'ansi', value: 8 },
  'scrollbar.track': { kind: 'ansi', value: 8 },
  'scrollbar.thumb': { kind: 'ansi', value: 15 },
  'diff.add': { kind: 'ansi', value: 10 },
  'diff.remove': { kind: 'ansi', value: 9 },
  'diff.context': { kind: 'ansi', value: 8 },
  'chart.series.1': { kind: 'ansi', value: 10 },
  'chart.series.2': { kind: 'ansi', value: 12 },
  'chart.series.3': { kind: 'ansi', value: 13 }
} satisfies Readonly<Record<CoreThemeToken, ThemeColor>>;

const highContrastColors = {
  ...modernColors,
  'app.background': { kind: 'ansi', value: 0 },
  'app.foreground': { kind: 'ansi', value: 15 },
  'surface.border': { kind: 'ansi', value: 15 },
  'text.muted': { kind: 'ansi', value: 7 },
  'accent.primary': { kind: 'ansi', value: 11 },
  'status.error': { kind: 'ansi', value: 15 },
  'status.warning': { kind: 'ansi', value: 11 },
  'selection.background': { kind: 'ansi', value: 15 },
  'selection.foreground': { kind: 'ansi', value: 0 },
  'focus.border': { kind: 'ansi', value: 15 },
  'menu.match': { kind: 'ansi', value: 11 }
} satisfies Readonly<Record<CoreThemeToken, ThemeColor>>;

export const minimalTheme: TerminalTheme = {
  name: 'minimal',
  colors: {},
  symbols: asciiSymbols,
  spacing: { gap: 1, padding: 0 }
};

export const modernTheme: TerminalTheme = {
  name: 'modern',
  colors: modernColors,
  symbols: unicodeSymbols,
  spacing: { gap: 1, padding: 0 }
};

export const compactTheme: TerminalTheme = {
  name: 'compact',
  colors: modernColors,
  symbols: asciiSymbols,
  spacing: { gap: 0, padding: 0 }
};

export const highContrastTheme: TerminalTheme = {
  name: 'highContrast',
  colors: highContrastColors,
  symbols: asciiSymbols,
  spacing: { gap: 1, padding: 0 }
};

export const noColorTheme: TerminalTheme = {
  name: 'noColor',
  colors: {},
  symbols: asciiSymbols,
  spacing: { gap: 1, padding: 0 }
};

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

export function mergeThemes(base: TerminalTheme, override: TerminalThemeDefinition): TerminalTheme {
  return {
    name: override.name ?? base.name,
    colors: { ...base.colors, ...(override.colors ?? {}) },
    symbols: mergeSymbols(base.symbols, override.symbols),
    spacing: { ...base.spacing, ...(override.spacing ?? {}) }
  };
}

export function resolveThemeColor(
  theme: TerminalTheme,
  token: ThemeToken,
  fallback: ThemeToken = 'text.default'
): ThemeColor | undefined {
  return theme.colors[token] ?? (fallback === token ? undefined : theme.colors[fallback]);
}

export function resolveTerminalStyle(
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): TerminalStyle | undefined {
  if (style === undefined) return undefined;
  const fg = style.fg?.kind === 'theme' ? resolveThemeColor(theme, style.fg.token) : style.fg;
  const bg = style.bg?.kind === 'theme' ? resolveThemeColor(theme, style.bg.token) : style.bg;
  const resolved: TerminalStyle = {
    ...(fg === undefined ? {} : { fg }),
    ...(bg === undefined ? {} : { bg }),
    ...(style.bold === undefined ? {} : { bold: style.bold }),
    ...(style.dim === undefined ? {} : { dim: style.dim }),
    ...(style.italic === undefined ? {} : { italic: style.italic }),
    ...(style.underline === undefined ? {} : { underline: style.underline }),
    ...(style.strikethrough === undefined ? {} : { strikethrough: style.strikethrough }),
    ...(style.inverse === undefined ? {} : { inverse: style.inverse }),
    ...(style.hidden === undefined ? {} : { hidden: style.hidden })
  };
  return Object.keys(resolved).length === 0 ? undefined : resolved;
}

export function isTerminalTheme(theme: TerminalTheme | TerminalThemeDefinition): theme is TerminalTheme {
  return theme.name !== undefined
    && theme.colors !== undefined
    && theme.symbols !== undefined
    && theme.spacing !== undefined;
}

function mergeSymbols(base: TerminalSymbols, override: TerminalSymbolsDefinition | undefined): TerminalSymbols {
  if (override === undefined) return base;
  return sanitizeSymbols({
    borderSingle: mergeBorder(base.borderSingle, override.borderSingle),
    borderRounded: mergeBorder(base.borderRounded, override.borderRounded),
    treeExpanded: override.treeExpanded ?? base.treeExpanded,
    treeCollapsed: override.treeCollapsed ?? base.treeCollapsed,
    pointer: override.pointer ?? base.pointer,
    selected: override.selected ?? base.selected,
    unselected: override.unselected ?? base.unselected,
    checkboxChecked: override.checkboxChecked ?? base.checkboxChecked,
    checkboxUnchecked: override.checkboxUnchecked ?? base.checkboxUnchecked,
    radioChecked: override.radioChecked ?? base.radioChecked,
    radioUnchecked: override.radioUnchecked ?? base.radioUnchecked,
    statusError: override.statusError ?? base.statusError,
    statusWarning: override.statusWarning ?? base.statusWarning,
    statusInfo: override.statusInfo ?? base.statusInfo,
    statusSuccess: override.statusSuccess ?? base.statusSuccess,
    progressFilled: override.progressFilled ?? base.progressFilled,
    progressEmpty: override.progressEmpty ?? base.progressEmpty,
    collapsed: override.collapsed ?? base.collapsed,
    expanded: override.expanded ?? base.expanded
  });
}

function mergeBorder(base: BorderGlyphSet, override: BorderGlyphSetDefinition | undefined): BorderGlyphSet {
  return {
    topLeft: override?.topLeft ?? base.topLeft,
    topRight: override?.topRight ?? base.topRight,
    bottomLeft: override?.bottomLeft ?? base.bottomLeft,
    bottomRight: override?.bottomRight ?? base.bottomRight,
    horizontal: override?.horizontal ?? base.horizontal,
    vertical: override?.vertical ?? base.vertical
  };
}

function sanitizeSymbols(symbols: TerminalSymbols): TerminalSymbols {
  return {
    borderSingle: sanitizeBorder(symbols.borderSingle),
    borderRounded: sanitizeBorder(symbols.borderRounded),
    treeExpanded: cleanSymbol(symbols.treeExpanded),
    treeCollapsed: cleanSymbol(symbols.treeCollapsed),
    pointer: cleanSymbol(symbols.pointer),
    selected: cleanSymbol(symbols.selected),
    unselected: cleanSymbol(symbols.unselected),
    checkboxChecked: cleanSymbol(symbols.checkboxChecked),
    checkboxUnchecked: cleanSymbol(symbols.checkboxUnchecked),
    radioChecked: cleanSymbol(symbols.radioChecked),
    radioUnchecked: cleanSymbol(symbols.radioUnchecked),
    statusError: cleanSymbol(symbols.statusError),
    statusWarning: cleanSymbol(symbols.statusWarning),
    statusInfo: cleanSymbol(symbols.statusInfo),
    statusSuccess: cleanSymbol(symbols.statusSuccess),
    progressFilled: cleanSymbol(symbols.progressFilled),
    progressEmpty: cleanSymbol(symbols.progressEmpty),
    collapsed: cleanSymbol(symbols.collapsed),
    expanded: cleanSymbol(symbols.expanded)
  };
}

function sanitizeBorder(border: BorderGlyphSet): BorderGlyphSet {
  return {
    topLeft: cleanSymbol(border.topLeft),
    topRight: cleanSymbol(border.topRight),
    bottomLeft: cleanSymbol(border.bottomLeft),
    bottomRight: cleanSymbol(border.bottomRight),
    horizontal: cleanSymbol(border.horizontal),
    vertical: cleanSymbol(border.vertical)
  };
}

function cleanSymbol(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
