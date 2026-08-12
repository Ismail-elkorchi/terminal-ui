/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
import type { TerminalStyle } from '../visual/render.ts';
import { mergeSymbols, sanitizeSymbols, symbolEntries } from './symbols.ts';
import type { TerminalDesignTokenDefinition, TerminalDesignTokens, ThemeColor, ThemeColorToken } from './tokens.ts';
import { isThemeColorToken } from '../visual/color.ts';

const canonicalThemes = new WeakSet<object>();
const canonicalDesignTokens = new WeakSet<object>();
const canonicalThemeColors = new WeakMap<object, ThemeColor>();

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
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Theme input must be an object.');
  }
  const { name, tokens: suppliedTokens } = input;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('Theme name must be a non-empty string.');
  }
  const tokens = normalizeDesignTokens(suppliedTokens);
  const theme = Object.freeze({
    name,
    tokens,
    fingerprint: themeFingerprint(name, tokens)
  });
  canonicalThemes.add(theme);
  return theme;
}

export function mergeThemes(base: TerminalTheme, override: TerminalThemeDefinition): TerminalTheme {
  if (!isTerminalTheme(base)) throw new TypeError('Theme base must be created by createTheme or defineTheme.');
  if (typeof override !== 'object' || override === null || Array.isArray(override)) {
    throw new TypeError('Theme definition must be an object.');
  }
  assertSupportedThemeFields(override);
  const { name, tokens } = override;
  return createTheme({
    name: name ?? base.name,
    tokens: mergeDesignTokens(base.tokens, tokens)
  });
}

export function mergeDesignTokens(
  base: TerminalDesignTokens,
  override: TerminalDesignTokenDefinition | undefined
): TerminalDesignTokens {
  const normalizedBase = normalizeDesignTokens(base);
  if (override === undefined) return normalizedBase;
  if (typeof override !== 'object' || override === null || Array.isArray(override)) {
    throw new TypeError('Design token definition must be an object.');
  }
  assertSupportedDesignTokenFields(override);
  const { colors, symbols } = override;
  return normalizeDesignTokens({
    colors: { ...normalizedBase.colors, ...(colors ?? {}) },
    symbols: mergeSymbols(normalizedBase.symbols, symbols)
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

export function terminalStyleHasBackground(
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): boolean {
  const background = style?.bg;
  return background !== undefined
    && (background.kind !== 'theme' || resolveThemeColor(theme, background.token) !== undefined);
}

export function isTerminalTheme(theme: TerminalTheme | TerminalThemeDefinition): theme is TerminalTheme {
  return typeof theme === 'object' && theme !== null && canonicalThemes.has(theme);
}

function normalizeDesignTokens(tokens: TerminalDesignTokens): TerminalDesignTokens {
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) {
    throw new TypeError('Design tokens must be an object.');
  }
  if (canonicalDesignTokens.has(tokens)) return tokens;
  const colors = normalizeColorTokens(tokens.colors);
  const symbols = sanitizeSymbols(tokens.symbols);
  const normalized = Object.freeze({ colors, symbols });
  canonicalDesignTokens.add(normalized);
  return normalized;
}

function themeFingerprint(name: string, tokens: TerminalDesignTokens): string {
  return `theme:${hashString(JSON.stringify([
    name,
    colorEntries(tokens.colors),
    symbolEntries(tokens.symbols)
  ]))}`;
}

function colorEntries(colors: TerminalDesignTokens['colors']): readonly unknown[] {
  return Object.entries(colors)
    .filter((entry): entry is [string, ThemeColor] => entry[1] !== undefined)
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

function assertSupportedThemeFields(definition: TerminalThemeDefinition): void {
  const keys = Object.keys(definition);
  for (const key of keys) {
    if (key !== 'name' && key !== 'tokens') {
      throw new TypeError(`Unsupported theme definition key: ${key}. Use tokens.colors or tokens.symbols.`);
    }
  }
}

function assertSupportedDesignTokenFields(definition: TerminalDesignTokenDefinition): void {
  for (const key of Object.keys(definition)) {
    if (key !== 'colors' && key !== 'symbols') {
      throw new TypeError(`Unsupported design token key: ${key}. Use colors or symbols.`);
    }
  }
}

function normalizeColorTokens(colors: TerminalDesignTokens['colors']): TerminalDesignTokens['colors'] {
  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
    throw new TypeError('Theme colors must be an object.');
  }
  const entries: [ThemeColorToken, ThemeColor][] = [];
  for (const [token, color] of Object.entries(colors)) {
    if (!isThemeColorToken(token)) {
      throw new TypeError(`Unsupported color token: ${token}. Custom color tokens must use the custom.* namespace.`);
    }
    if (color !== undefined) entries.push([token, normalizeThemeColor(color, `Theme color ${token}`)]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function normalizeThemeColor(value: unknown, subject: string): ThemeColor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  const existing = canonicalThemeColors.get(value);
  if (existing !== undefined) return existing;
  const kind = 'kind' in value ? value.kind : undefined;
  let normalized: ThemeColor;
  if (kind === 'ansi') {
    const index = 'value' in value ? value.value : undefined;
    if (!colorChannel(index)) {
      throw new RangeError(`${subject}.value must be an integer from 0 through 255.`);
    }
    normalized = Object.freeze({ kind: 'ansi', value: index });
  } else if (kind === 'rgb') {
    const r = 'r' in value ? value.r : undefined;
    const g = 'g' in value ? value.g : undefined;
    const b = 'b' in value ? value.b : undefined;
    if (!colorChannel(r) || !colorChannel(g) || !colorChannel(b)) {
      throw new RangeError(`${subject} channels must be integers from 0 through 255.`);
    }
    normalized = Object.freeze({ kind: 'rgb', r, g, b });
  } else {
    throw new TypeError(`${subject}.kind must be "ansi" or "rgb".`);
  }
  canonicalThemeColors.set(normalized, normalized);
  return normalized;
}

function colorChannel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}
