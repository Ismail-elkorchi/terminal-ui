import { createCapabilities } from '../host/capabilities.ts';
import type { TerminalCapabilities } from '../host/index.ts';
import type { Rect } from './layout.ts';
import type { CursorPosition } from './frame.ts';
import type { TerminalColor, TerminalLink, TerminalStyle } from './render-primitives.ts';
import { sameTerminalColor } from './render-primitives.ts';

export interface TerminalSerializationPolicyInput {
  readonly capabilities?: TerminalCapabilities;
  readonly forceColor?: boolean;
}

export interface TerminalSerializationPolicy {
  readonly capabilities: TerminalCapabilities;
  cursorMove(row: number, column: number, previous?: CursorPosition): string;
  clearLine(row: number, fromColumn?: number): string;
  clearRect(bounds: Rect): string;
  showCursor(visible: boolean): string;
  resetStyle(): string;
  styleTransition(previous: TerminalStyle | undefined, next: TerminalStyle | undefined): string;
  openHyperlink(link: TerminalLink): string;
  closeHyperlink(): string;
}

export function createTerminalSerializationPolicy(
  input: TerminalSerializationPolicyInput = {}
): TerminalSerializationPolicy {
  const capabilities = input.capabilities ?? defaultSerializationCapabilities;
  return {
    capabilities,
    cursorMove(row, column) {
      return csi(`${String(row)};${String(column)}H`);
    },
    clearLine(row, fromColumn = 1) {
      return `${csi(`${String(row)};${String(fromColumn)}H`)}${csi('0K')}`;
    },
    clearRect(bounds) {
      const parts: string[] = [];
      for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
        parts.push(`${csi(`${String(row)};${String(bounds.column)}H`)}${' '.repeat(Math.max(0, bounds.width))}`);
      }
      return parts.join('');
    },
    showCursor(visible) {
      return visible ? csi('?25h') : csi('?25l');
    },
    resetStyle() {
      return sgr(['0']);
    },
    styleTransition(previous, next) {
      if (previous === undefined) return styleOpen(next, capabilities, input.forceColor);
      const codes = styleTransitionCodes(previous, next, capabilities, input.forceColor);
      return sgr(codes);
    },
    openHyperlink(link) {
      const params = link.id === undefined ? '' : `id=${link.id}`;
      return `${escapeSequence}]8;${params};${link.href}${bellSequence}`;
    },
    closeHyperlink() {
      return `${escapeSequence}]8;;${bellSequence}`;
    }
  };
}

const escapeSequence = '\u001B';
const bellSequence = '\u0007';
const defaultSerializationCapabilities = createCapabilities({
  runtime: 'memory',
  inputIsTty: false,
  outputIsTty: false,
  rawInput: false
});

function csi(body: string): string {
  return `${escapeSequence}[${body}`;
}

function sgr(codes: readonly string[]): string {
  return codes.length === 0 ? '' : csi(`${codes.join(';')}m`);
}

function styleOpen(
  style: TerminalStyle | undefined,
  capabilities: TerminalCapabilities,
  forceColor: boolean | undefined
): string {
  if (style === undefined) return '';
  return sgr(styleCodes(style, capabilities, forceColor));
}

function styleTransitionCodes(
  previous: TerminalStyle,
  next: TerminalStyle | undefined,
  capabilities: TerminalCapabilities,
  forceColor: boolean | undefined
): readonly string[] {
  if (forceColor !== true && capabilities.color.depth === 0) return [];
  const codes: string[] = [
    ...flagTransition(previous.bold, next?.bold, '1', '22'),
    ...flagTransition(previous.dim, next?.dim, '2', '22'),
    ...flagTransition(previous.italic, next?.italic, '3', '23'),
    ...flagTransition(previous.underline, next?.underline, '4', '24'),
    ...flagTransition(previous.inverse, next?.inverse, '7', '27'),
    ...flagTransition(previous.hidden, next?.hidden, '8', '28'),
    ...flagTransition(previous.strikethrough, next?.strikethrough, '9', '29')
  ];
  codes.push(...colorTransitionCodes('fg', previous.fg, next?.fg, capabilities, forceColor));
  codes.push(...colorTransitionCodes('bg', previous.bg, next?.bg, capabilities, forceColor));
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

function styleCodes(
  style: TerminalStyle,
  capabilities: TerminalCapabilities,
  forceColor: boolean | undefined
): readonly string[] {
  if (forceColor !== true && capabilities.color.depth === 0) return [];
  const codes: string[] = [
    ...(style.bold === true ? ['1'] : []),
    ...(style.dim === true ? ['2'] : []),
    ...(style.italic === true ? ['3'] : []),
    ...(style.underline === true ? ['4'] : []),
    ...(style.inverse === true ? ['7'] : []),
    ...(style.hidden === true ? ['8'] : []),
    ...(style.strikethrough === true ? ['9'] : [])
  ];
  codes.push(...colorCodes('fg', style.fg, capabilities, forceColor));
  codes.push(...colorCodes('bg', style.bg, capabilities, forceColor));
  return codes;
}

function colorTransitionCodes(
  target: 'fg' | 'bg',
  previous: TerminalColor | undefined,
  next: TerminalColor | undefined,
  capabilities: TerminalCapabilities,
  forceColor: boolean | undefined
): readonly string[] {
  if (sameTerminalColor(previous, next)) return [];
  if (next === undefined) return [target === 'fg' ? '39' : '49'];
  return colorCodes(target, next, capabilities, forceColor);
}

function colorCodes(
  target: 'fg' | 'bg',
  color: TerminalColor | undefined,
  capabilities: TerminalCapabilities,
  forceColor: boolean | undefined
): readonly string[] {
  if (color === undefined || color.kind === 'theme') return [];
  const depth = forceColor === true ? Math.max(capabilities.color.depth, 8) : capabilities.color.depth;
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
