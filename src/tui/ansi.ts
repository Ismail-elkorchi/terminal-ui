import { sanitizeTerminalText } from '../text/index.ts';
import { defaultTheme, defineTheme, isTerminalTheme, resolveTerminalStyle } from '../theme/index.ts';
import type { TerminalCapabilities } from '../host/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { RenderSpan, TerminalColor, TerminalLink, TerminalStyle } from './render-primitives.ts';
import { sameTerminalColor, sameTerminalLink, sameTerminalStyle } from './render-primitives.ts';

export interface RenderSerializeOptions {
  readonly capabilities: TerminalCapabilities;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly forceColor?: boolean;
  readonly hyperlinks?: boolean;
}

export interface AnsiStyleState {
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
}

export function serializeRenderSpans(
  spans: readonly RenderSpan[],
  options?: RenderSerializeOptions
): string {
  return serializeRenderSpansStateful(spans, options);
}

export function serializeRenderSpansStateful(
  spans: readonly RenderSpan[],
  options?: RenderSerializeOptions
): string {
  let output = '';
  let state: AnsiStyleState = {};
  for (const currentSpan of spans) {
    const text = sanitizeTerminalText(currentSpan.text).text;
    if (text.length === 0) continue;
    const nextLink = effectiveLink(currentSpan, options);
    const nextStyle = effectiveStyle(currentSpan.style, options);
    if (!sameTerminalLink(state.link, nextLink)) {
      output += closeLink(state);
      output += openLink(nextLink);
      state = nextLink === undefined ? withoutLink(state) : { ...state, link: nextLink };
    }
    if (!sameTerminalStyle(state.style, nextStyle)) {
      const transition = styleTransition(state.style, nextStyle, options);
      output += transition;
      state = transition.length === 0 || nextStyle === undefined ? withoutStyle(state) : { ...state, style: nextStyle };
    }
    output += text;
  }
  output += closeStyle(state);
  output += closeLink(state);
  return output;
}

function effectiveStyle(style: TerminalStyle | undefined, options: RenderSerializeOptions | undefined): TerminalStyle | undefined {
  const theme = themeForOptions(options);
  return resolveTerminalStyle(style, theme);
}

function themeForOptions(options: RenderSerializeOptions | undefined): TerminalTheme {
  const theme = options?.theme;
  if (theme === undefined) return defaultTheme;
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}

function closeStyle(state: AnsiStyleState): string {
  return state.style === undefined ? '' : '\u001B[0m';
}

function withoutStyle(state: AnsiStyleState): AnsiStyleState {
  return state.link === undefined ? {} : { link: state.link };
}

function withoutLink(state: AnsiStyleState): AnsiStyleState {
  return state.style === undefined ? {} : { style: state.style };
}

function styleOpen(style: TerminalStyle | undefined, options: RenderSerializeOptions | undefined): string {
  if (style === undefined) return '';
  const codes = styleCodes(style, options);
  return codes.length === 0 ? '' : `\u001B[${codes.join(';')}m`;
}

function styleTransition(
  previous: TerminalStyle | undefined,
  next: TerminalStyle | undefined,
  options: RenderSerializeOptions | undefined
): string {
  if (previous === undefined) return styleOpen(next, options);
  const codes = styleTransitionCodes(previous, next, options);
  return codes.length === 0 ? '' : `\u001B[${codes.join(';')}m`;
}

function styleTransitionCodes(
  previous: TerminalStyle,
  next: TerminalStyle | undefined,
  options: RenderSerializeOptions | undefined
): readonly string[] {
  if (options !== undefined && options.forceColor !== true && options.capabilities.color.depth === 0) return [];
  const codes: string[] = [
    ...flagTransition(previous.bold, next?.bold, '1', '22'),
    ...flagTransition(previous.dim, next?.dim, '2', '22'),
    ...flagTransition(previous.italic, next?.italic, '3', '23'),
    ...flagTransition(previous.underline, next?.underline, '4', '24'),
    ...flagTransition(previous.inverse, next?.inverse, '7', '27'),
    ...flagTransition(previous.hidden, next?.hidden, '8', '28'),
    ...flagTransition(previous.strikethrough, next?.strikethrough, '9', '29')
  ];
  codes.push(...colorTransitionCodes('fg', previous.fg, next?.fg, options));
  codes.push(...colorTransitionCodes('bg', previous.bg, next?.bg, options));
  return uniqueCodes(codes);
}

function flagTransition(
  previous: boolean | undefined,
  next: boolean | undefined,
  enableCode: string,
  disableCode: string
): readonly string[] {
  if (previous === true && next !== true) return [disableCode];
  if (previous !== true && next === true) return [enableCode];
  return [];
}

function uniqueCodes(codes: readonly string[]): readonly string[] {
  return [...new Set(codes)];
}

function styleCodes(style: TerminalStyle, options: RenderSerializeOptions | undefined): readonly string[] {
  if (options !== undefined && options.forceColor !== true && options.capabilities.color.depth === 0) return [];
  const codes: string[] = [
    ...(style.bold === true ? ['1'] : []),
    ...(style.dim === true ? ['2'] : []),
    ...(style.italic === true ? ['3'] : []),
    ...(style.underline === true ? ['4'] : []),
    ...(style.inverse === true ? ['7'] : []),
    ...(style.hidden === true ? ['8'] : []),
    ...(style.strikethrough === true ? ['9'] : [])
  ];
  codes.push(...colorCodes('fg', style.fg, options));
  codes.push(...colorCodes('bg', style.bg, options));
  return codes;
}

function colorTransitionCodes(
  target: 'fg' | 'bg',
  previous: TerminalColor | undefined,
  next: TerminalColor | undefined,
  options: RenderSerializeOptions | undefined
): readonly string[] {
  if (sameTerminalColor(previous, next)) return [];
  if (next === undefined) return [target === 'fg' ? '39' : '49'];
  return colorCodes(target, next, options);
}

function colorCodes(
  target: 'fg' | 'bg',
  color: TerminalColor | undefined,
  options: RenderSerializeOptions | undefined
): readonly string[] {
  if (color === undefined || color.kind === 'theme') return [];
  const depth = options?.forceColor === true ? Math.max(options.capabilities.color.depth, 8) : options?.capabilities.color.depth ?? 0;
  if (depth === 0) return [];
  if (color.kind === 'ansi') return ansiColorCodes(target, color.value, depth);
  return rgbColorCodes(target, color, depth);
}

function ansiColorCodes(target: 'fg' | 'bg', value: number, depth: number): readonly string[] {
  const normalized = Math.max(0, Math.min(255, Math.floor(value)));
  if (depth >= 8) return [target === 'fg' ? '38' : '48', '5', String(normalized)];
  const basic = normalized % 16;
  return [String(basicAnsiCode(target, basic))];
}

function rgbColorCodes(
  target: 'fg' | 'bg',
  color: Extract<TerminalColor, { readonly kind: 'rgb' }>,
  depth: number
): readonly string[] {
  const r = clampByte(color.r);
  const g = clampByte(color.g);
  const b = clampByte(color.b);
  if (depth === 24) return [target === 'fg' ? '38' : '48', '2', String(r), String(g), String(b)];
  if (depth >= 8) return [target === 'fg' ? '38' : '48', '5', String(rgbToAnsi256(r, g, b))];
  if (depth >= 1) return [String(basicAnsiCode(target, rgbToBasicAnsi(r, g, b)))];
  return [];
}

function basicAnsiCode(target: 'fg' | 'bg', value: number): number {
  const base = target === 'fg' ? 30 : 40;
  const brightBase = target === 'fg' ? 90 : 100;
  return value < 8 ? base + value : brightBase + value - 8;
}

function rgbToAnsi256(r: number, g: number, b: number): number {
  const toCube = (value: number): number => Math.round(value / 255 * 5);
  return 16 + 36 * toCube(r) + 6 * toCube(g) + toCube(b);
}

function rgbToBasicAnsi(r: number, g: number, b: number): number {
  const bright = Math.max(r, g, b) > 170 ? 8 : 0;
  const red = r >= 85 ? 1 : 0;
  const green = g >= 85 ? 2 : 0;
  const blue = b >= 85 ? 4 : 0;
  return bright + red + green + blue;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function effectiveLink(span: RenderSpan, options: RenderSerializeOptions | undefined): TerminalLink | undefined {
  if (span.link === undefined) return undefined;
  if (options?.hyperlinks !== true || !options.capabilities.hyperlinks.supported) return undefined;
  const href = sanitizeTerminalText(span.link.href).text;
  if (href.length === 0) return undefined;
  if (span.link.id === undefined) return { href };
  return { href, id: sanitizeTerminalText(span.link.id).text };
}

function openLink(link: TerminalLink | undefined): string {
  if (link === undefined) return '';
  const params = link.id === undefined ? '' : `id=${link.id}`;
  return `\u001B]8;${params};${link.href}\u0007`;
}

function closeLink(state: AnsiStyleState): string {
  return state.link === undefined ? '' : '\u001B]8;;\u0007';
}
