import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalCapabilities } from '../host/index.ts';

export type StyledTone = 'normal' | 'muted' | 'info' | 'success' | 'warning' | 'error' | 'accent';
export type StyledEmphasis = 'normal' | 'bold' | 'italic' | 'underline';

export interface StyledText {
  readonly text: string;
  readonly tone?: StyledTone;
  readonly emphasis?: StyledEmphasis;
}

export interface TerminalTheme {
  readonly name: string;
  readonly symbols: TerminalSymbols;
  readonly styles: TerminalStyles;
  readonly spacing: TerminalSpacing;
}

export interface TerminalSymbols {
  readonly pointer: string;
  readonly selected: string;
  readonly unselected: string;
  readonly checked: string;
  readonly unchecked: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
  readonly success: string;
  readonly progressIncomplete: string;
  readonly progressComplete: string;
}

export interface TerminalStyles {
  readonly tones: Record<StyledTone, TerminalTextStyle>;
  readonly emphasis: Record<StyledEmphasis, TerminalTextStyle>;
}

export interface TerminalTextStyle {
  readonly color?: AnsiColor;
  readonly dim?: boolean;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

export type AnsiColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite';

export interface TerminalSpacing {
  readonly gap: number;
  readonly padding: number;
}

export interface TerminalThemeDefinition {
  readonly name?: string;
  readonly symbols?: Partial<TerminalSymbols>;
  readonly styles?: Partial<{
    readonly tones: Partial<Record<StyledTone, TerminalTextStyle>>;
    readonly emphasis: Partial<Record<StyledEmphasis, TerminalTextStyle>>;
  }>;
  readonly spacing?: Partial<TerminalSpacing>;
}

export const defaultTheme: TerminalTheme = {
  name: 'default',
  symbols: {
    pointer: '>',
    selected: '*',
    unselected: ' ',
    checked: '[x]',
    unchecked: '[ ]',
    error: '!',
    warning: '!',
    info: 'i',
    success: '+',
    progressIncomplete: '-',
    progressComplete: '#'
  },
  styles: {
    tones: {
      normal: {},
      muted: { color: 'brightBlack' },
      info: { color: 'cyan' },
      success: { color: 'green' },
      warning: { color: 'yellow' },
      error: { color: 'red' },
      accent: { color: 'magenta' }
    },
    emphasis: {
      normal: {},
      bold: { bold: true },
      italic: { italic: true },
      underline: { underline: true }
    }
  },
  spacing: { gap: 1, padding: 0 }
};

export function defineTheme(theme: TerminalThemeDefinition): TerminalTheme {
  return mergeThemes(defaultTheme, theme);
}

export function mergeThemes(base: TerminalTheme, override: TerminalThemeDefinition): TerminalTheme {
  return {
    name: override.name ?? base.name,
    symbols: sanitizeSymbols({ ...base.symbols, ...(override.symbols ?? {}) }),
    styles: {
      tones: mergeStyleMap(base.styles.tones, override.styles?.tones),
      emphasis: mergeStyleMap(base.styles.emphasis, override.styles?.emphasis)
    },
    spacing: { ...base.spacing, ...(override.spacing ?? {}) }
  };
}

function sanitizeSymbols(symbols: TerminalSymbols): TerminalSymbols {
  return {
    pointer: sanitizeTerminalText(symbols.pointer).text,
    selected: sanitizeTerminalText(symbols.selected).text,
    unselected: sanitizeTerminalText(symbols.unselected).text,
    checked: sanitizeTerminalText(symbols.checked).text,
    unchecked: sanitizeTerminalText(symbols.unchecked).text,
    error: sanitizeTerminalText(symbols.error).text,
    warning: sanitizeTerminalText(symbols.warning).text,
    info: sanitizeTerminalText(symbols.info).text,
    success: sanitizeTerminalText(symbols.success).text,
    progressIncomplete: sanitizeTerminalText(symbols.progressIncomplete).text,
    progressComplete: sanitizeTerminalText(symbols.progressComplete).text
  };
}

export function renderStyledText(
  text: StyledText,
  theme: TerminalTheme,
  capabilities: TerminalCapabilities
): string {
  const sanitized = sanitizeTerminalText(text.text).text;
  if (capabilities.color.depth === 0) return sanitized;
  const toneStyle = theme.styles.tones[text.tone ?? 'normal'];
  const emphasisStyle = theme.styles.emphasis[text.emphasis ?? 'normal'];
  const style = mergeTextStyle(toneStyle, emphasisStyle);
  const open = ansiOpenCodes(style).join('');
  return open.length === 0 ? sanitized : `${open}${sanitized}\u001B[0m`;
}

function mergeStyleMap<TKey extends string>(
  base: Record<TKey, TerminalTextStyle>,
  override: Partial<Record<TKey, TerminalTextStyle>> | undefined
): Record<TKey, TerminalTextStyle> {
  const entries = (Object.keys(base) as TKey[]).map((key) => [key, mergeTextStyle(base[key], override?.[key])] as const);
  return Object.fromEntries(entries) as Record<TKey, TerminalTextStyle>;
}

function mergeTextStyle(
  base: TerminalTextStyle | undefined,
  override: TerminalTextStyle | undefined
): TerminalTextStyle {
  return { ...(base ?? {}), ...(override ?? {}) };
}

function ansiOpenCodes(style: TerminalTextStyle): readonly string[] {
  return [
    style.dim === true ? '\u001B[2m' : undefined,
    style.bold === true ? '\u001B[1m' : undefined,
    style.italic === true ? '\u001B[3m' : undefined,
    style.underline === true ? '\u001B[4m' : undefined,
    style.color === undefined ? undefined : `\u001B[${String(ansiColorCode(style.color))}m`
  ].filter((code): code is string => code !== undefined);
}

function ansiColorCode(color: AnsiColor): number {
  switch (color) {
    case 'black':
      return 30;
    case 'red':
      return 31;
    case 'green':
      return 32;
    case 'yellow':
      return 33;
    case 'blue':
      return 34;
    case 'magenta':
      return 35;
    case 'cyan':
      return 36;
    case 'white':
      return 37;
    case 'brightBlack':
      return 90;
    case 'brightRed':
      return 91;
    case 'brightGreen':
      return 92;
    case 'brightYellow':
      return 93;
    case 'brightBlue':
      return 94;
    case 'brightMagenta':
      return 95;
    case 'brightCyan':
      return 96;
    case 'brightWhite':
      return 97;
  }
}
