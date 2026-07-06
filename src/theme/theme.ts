import type { TerminalStyle } from '../tui/render-primitives.ts';
import { mergeSymbols, sanitizeSymbols, symbolEntries } from './symbols.ts';
import type { TerminalDesignTokenDefinition, TerminalDesignTokens, TerminalSpacingTokens, ThemeColor, ThemeColorToken } from './tokens.ts';

export interface TerminalTheme {
  readonly name: string;
  readonly fingerprint: string;
  readonly tokens: TerminalDesignTokens;
}

export interface TerminalThemeDefinition {
  readonly name?: string;
  readonly tokens?: TerminalDesignTokenDefinition;
}

export function createTheme(input: { readonly name: string; readonly tokens: TerminalDesignTokens }): TerminalTheme {
  const tokens = normalizeDesignTokens(input.tokens);
  return {
    name: input.name,
    tokens,
    fingerprint: themeFingerprint(input.name, tokens)
  };
}

export function mergeThemes(base: TerminalTheme, override: TerminalThemeDefinition): TerminalTheme {
  assertThemeDefinition(override);
  return createTheme({
    name: override.name ?? base.name,
    tokens: mergeDesignTokens(base.tokens, override.tokens)
  });
}

export function mergeDesignTokens(
  base: TerminalDesignTokens,
  override: TerminalDesignTokenDefinition | undefined
): TerminalDesignTokens {
  if (override === undefined) return base;
  return normalizeDesignTokens({
    colors: { ...base.colors, ...(override.colors ?? {}) },
    symbols: mergeSymbols(base.symbols, override.symbols),
    spacing: { ...base.spacing, ...(override.spacing ?? {}) }
  });
}

export function resolveThemeColor(
  theme: TerminalTheme,
  token: ThemeColorToken,
  fallback: ThemeColorToken = 'text.default'
): ThemeColor | undefined {
  return theme.tokens.colors[token] ?? (fallback === token ? undefined : theme.tokens.colors[fallback]);
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
    && 'fingerprint' in theme
    && typeof theme.fingerprint === 'string'
    && 'tokens' in theme
    && typeof theme.tokens === 'object';
}

function normalizeDesignTokens(tokens: TerminalDesignTokens): TerminalDesignTokens {
  return {
    colors: Object.freeze({ ...tokens.colors }),
    symbols: sanitizeSymbols(tokens.symbols),
    spacing: normalizeSpacing(tokens.spacing)
  };
}

function normalizeSpacing(spacing: TerminalSpacingTokens): TerminalSpacingTokens {
  return {
    gap: normalizeSpacingValue(spacing.gap),
    padding: normalizeSpacingValue(spacing.padding)
  };
}

function normalizeSpacingValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function themeFingerprint(name: string, tokens: TerminalDesignTokens): string {
  return `theme:${hashString(JSON.stringify([
    name,
    colorEntries(tokens.colors),
    symbolEntries(tokens.symbols),
    [tokens.spacing.gap, tokens.spacing.padding]
  ]))}`;
}

function colorEntries(colors: Readonly<Record<string, ThemeColor>>): readonly unknown[] {
  return Object.entries(colors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([token, color]) => [
      token,
      color.kind === 'ansi'
        ? ['ansi', color.value]
        : ['rgb', color.r, color.g, color.b]
    ]);
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function assertThemeDefinition(definition: TerminalThemeDefinition): void {
  const keys = Object.keys(definition);
  for (const key of keys) {
    if (key !== 'name' && key !== 'tokens') {
      throw new TypeError(`Unsupported theme definition key: ${key}. Use tokens.colors, tokens.symbols, or tokens.spacing.`);
    }
  }
}
