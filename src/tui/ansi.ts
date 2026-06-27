import { sanitizeTerminalText } from '../text/index.ts';
import { defaultTheme, defineTheme, isTerminalTheme, resolveTerminalStyle } from '../theme/index.ts';
import type { TerminalCapabilities } from '../host/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { RenderSpan, TerminalColor, TerminalStyle } from './render-primitives.ts';

export interface RenderSerializeOptions {
  readonly capabilities: TerminalCapabilities;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly forceColor?: boolean;
  readonly hyperlinks?: boolean;
}

export function serializeRenderSpans(
  spans: readonly RenderSpan[],
  options?: RenderSerializeOptions
): string {
  return spans.map((currentSpan) => serializeRenderSpan(currentSpan, options)).join('');
}

function serializeRenderSpan(span: RenderSpan, options: RenderSerializeOptions | undefined): string {
  const text = sanitizeTerminalText(span.text).text;
  if (text.length === 0) return '';
  const styled = styleOpen(resolveStyle(span.style, options), options);
  const linked = linkOpen(span, options);
  const closeLink = linked.length === 0 ? '' : '\u001B]8;;\u0007';
  const reset = styled.length === 0 ? '' : '\u001B[0m';
  return `${linked}${styled}${text}${reset}${closeLink}`;
}

function resolveStyle(style: TerminalStyle | undefined, options: RenderSerializeOptions | undefined): TerminalStyle | undefined {
  const theme = themeForOptions(options);
  return resolveTerminalStyle(style, theme);
}

function themeForOptions(options: RenderSerializeOptions | undefined): TerminalTheme {
  const theme = options?.theme;
  if (theme === undefined) return defaultTheme;
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}

function styleOpen(style: TerminalStyle | undefined, options: RenderSerializeOptions | undefined): string {
  if (style === undefined) return '';
  const codes = styleCodes(style, options);
  return codes.length === 0 ? '' : `\u001B[${codes.join(';')}m`;
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

function linkOpen(span: RenderSpan, options: RenderSerializeOptions | undefined): string {
  if (span.link === undefined) return '';
  if (options?.hyperlinks !== true || !options.capabilities.hyperlinks.supported) return '';
  const href = sanitizeTerminalText(span.link.href).text;
  if (href.length === 0) return '';
  const params = span.link.id === undefined ? '' : `id=${sanitizeTerminalText(span.link.id).text}`;
  return `\u001B]8;${params};${href}\u0007`;
}
