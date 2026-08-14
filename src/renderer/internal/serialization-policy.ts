import {
  defaultTerminalOutputCapabilities,
  type TerminalOutputCapabilityProfile
} from '../../protocol/index.ts';
import type { Rect } from '../contracts.ts';
import type { CursorPosition } from '../contracts.ts';
import type { TerminalColor, TerminalLink, TerminalStyle } from '../../visual/render.ts';
import { sameTerminalColor } from '../../visual/render.ts';
import {
  ansi256ToBasicAnsi,
  rgbToAnsi256,
  rgbToBasicAnsi
} from '../../visual/color-conversion.ts';

export interface TerminalSerializationPolicyInput {
  readonly capabilities?: TerminalOutputCapabilityProfile;
  readonly forceColor?: boolean;
}

export interface TerminalSerializationPolicy {
  readonly capabilities: TerminalOutputCapabilityProfile;
  cursorMove(row: number, column: number, previous?: CursorPosition): string;
  eraseLineToEnd(): string;
  setScrollingRegion(top: number, bottom: number): string;
  resetScrollingRegion(): string;
  scrollRows(rows: number): string;
  clearLine(row: number, fromColumn?: number): string;
  clearRect(bounds: Rect): string;
  showCursor(visible: boolean): string;
  resetStyle(): string;
  effectiveStyle(style: TerminalStyle | undefined): TerminalStyle | undefined;
  styleTransition(previous: TerminalStyle | undefined, next: TerminalStyle | undefined): string;
  openHyperlink(link: TerminalLink): string;
  closeHyperlink(): string;
  beginSynchronizedOutput(): string;
  endSynchronizedOutput(): string;
}

export function createTerminalSerializationPolicy(
  input: TerminalSerializationPolicyInput = {}
): TerminalSerializationPolicy {
  const capabilities = input.capabilities ?? defaultSerializationCapabilities;
  return {
    capabilities,
    cursorMove(row, column, previous) {
      const absolute = absoluteCursorMove(row, column);
      if (previous === undefined || !capabilities.isTty) return absolute;
      return shorter(relativeCursorMove(previous, { row, column }), absolute);
    },
    clearLine(row, fromColumn = 1) {
      return `${absoluteCursorMove(row, fromColumn)}${csi('0K')}`;
    },
    eraseLineToEnd() {
      return csi('0K');
    },
    setScrollingRegion(top, bottom) {
      return csi(`${String(top)};${String(bottom)}r`);
    },
    resetScrollingRegion() {
      return csi('r');
    },
    scrollRows(rows) {
      const distance = Math.max(1, Math.abs(Math.trunc(rows)));
      return csi(`${distance === 1 ? '' : String(distance)}${rows >= 0 ? 'S' : 'T'}`);
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
    effectiveStyle(style) {
      return serializedStyle(style, capabilities, input.forceColor);
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
    },
    beginSynchronizedOutput() {
      return csi('?2026h');
    },
    endSynchronizedOutput() {
      return csi('?2026l');
    }
  };
}

function serializedStyle(
  style: TerminalStyle | undefined,
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): TerminalStyle | undefined {
  if (style === undefined) return undefined;
  const attributes = textAttributesAvailable(capabilities);
  const fg = serializedColor(style.fg, capabilities, forceColor);
  const bg = serializedColor(style.bg, capabilities, forceColor);
  const effective = {
    ...(fg === undefined ? {} : { fg }),
    ...(bg === undefined ? {} : { bg }),
    ...(attributes && style.bold === true ? { bold: true } : {}),
    ...(attributes && style.dim === true ? { dim: true } : {}),
    ...(attributes && style.italic === true ? { italic: true } : {}),
    ...(attributes && style.underline === true ? { underline: true } : {}),
    ...(attributes && style.inverse === true ? { inverse: true } : {}),
    ...(attributes && style.hidden === true ? { hidden: true } : {}),
    ...(attributes && style.strikethrough === true ? { strikethrough: true } : {})
  } satisfies TerminalStyle;
  return Object.keys(effective).length === 0 ? undefined : Object.freeze(effective);
}

function serializedColor(
  color: TerminalColor | undefined,
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): TerminalColor | undefined {
  return color === undefined || color.kind === 'theme' || !colorsAvailable(capabilities, forceColor)
    ? undefined
    : color;
}

const escapeSequence = '\u001B';
const bellSequence = '\u0007';
const defaultSerializationCapabilities = defaultTerminalOutputCapabilities;

function csi(body: string): string {
  return `${escapeSequence}[${body}`;
}

function sgr(codes: readonly string[]): string {
  return codes.length === 0 ? '' : csi(`${codes.join(';')}m`);
}

function absoluteCursorMove(row: number, column: number): string {
  if (row === 1 && column === 1) return csi('H');
  if (column === 1) return csi(`${String(row)}H`);
  return csi(`${String(row)};${String(column)}H`);
}

function relativeCursorMove(previous: CursorPosition, next: CursorPosition): string {
  if (previous.row === next.row && previous.column === next.column) return '';
  const parts: string[] = [];
  const rowDelta = next.row - previous.row;
  if (rowDelta < 0) parts.push(relativeSequence(-rowDelta, 'A'));
  if (rowDelta > 0) parts.push(relativeSequence(rowDelta, 'B'));
  if (next.column === 1) {
    if (previous.column !== 1) parts.push(carriageReturn);
    return parts.join('');
  }
  const columnDelta = next.column - previous.column;
  if (columnDelta < 0) parts.push(relativeSequence(-columnDelta, 'D'));
  if (columnDelta > 0) parts.push(relativeSequence(columnDelta, 'C'));
  return parts.join('');
}

function relativeSequence(distance: number, suffix: 'A' | 'B' | 'C' | 'D'): string {
  return distance === 1 ? csi(suffix) : csi(`${String(distance)}${suffix}`);
}

function shorter(left: string, right: string): string {
  return utf8Bytes(left) < utf8Bytes(right) ? left : right;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

const carriageReturn = '\r';

function styleOpen(
  style: TerminalStyle | undefined,
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): string {
  if (style === undefined) return '';
  return sgr(styleCodes(style, capabilities, forceColor));
}

function styleTransitionCodes(
  previous: TerminalStyle,
  next: TerminalStyle | undefined,
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): readonly string[] {
  const attributes = textAttributesAvailable(capabilities);
  const attributeCodes = uniqueCodes([
    ...(attributes ? intensityTransition(previous, next) : []),
    ...(attributes ? flagTransition(previous.italic, next?.italic, '3', '23') : []),
    ...(attributes ? flagTransition(previous.underline, next?.underline, '4', '24') : []),
    ...(attributes ? flagTransition(previous.inverse, next?.inverse, '7', '27') : []),
    ...(attributes ? flagTransition(previous.hidden, next?.hidden, '8', '28') : []),
    ...(attributes ? flagTransition(previous.strikethrough, next?.strikethrough, '9', '29') : [])
  ]);
  return [
    ...attributeCodes,
    ...colorTransitionCodes('fg', previous.fg, next?.fg, capabilities, forceColor),
    ...colorTransitionCodes('bg', previous.bg, next?.bg, capabilities, forceColor)
  ];
}

function intensityTransition(previous: TerminalStyle, next: TerminalStyle | undefined): readonly string[] {
  const previousBold = previous.bold === true;
  const previousDim = previous.dim === true;
  const nextBold = next?.bold === true;
  const nextDim = next?.dim === true;
  if (previousBold === nextBold && previousDim === nextDim) return [];
  if (!previousBold && !previousDim) {
    return [
      ...(nextBold ? ['1'] : []),
      ...(nextDim ? ['2'] : [])
    ];
  }
  return [
    '22',
    ...(nextBold ? ['1'] : []),
    ...(nextDim ? ['2'] : [])
  ];
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
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): readonly string[] {
  const codes: string[] = [
    ...(textAttributesAvailable(capabilities) && style.bold === true ? ['1'] : []),
    ...(textAttributesAvailable(capabilities) && style.dim === true ? ['2'] : []),
    ...(textAttributesAvailable(capabilities) && style.italic === true ? ['3'] : []),
    ...(textAttributesAvailable(capabilities) && style.underline === true ? ['4'] : []),
    ...(textAttributesAvailable(capabilities) && style.inverse === true ? ['7'] : []),
    ...(textAttributesAvailable(capabilities) && style.hidden === true ? ['8'] : []),
    ...(textAttributesAvailable(capabilities) && style.strikethrough === true ? ['9'] : [])
  ];
  codes.push(...colorCodes('fg', style.fg, capabilities, forceColor));
  codes.push(...colorCodes('bg', style.bg, capabilities, forceColor));
  return codes;
}

function colorTransitionCodes(
  target: 'fg' | 'bg',
  previous: TerminalColor | undefined,
  next: TerminalColor | undefined,
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): readonly string[] {
  if (!colorsAvailable(capabilities, forceColor)) return [];
  if (sameTerminalColor(previous, next)) return [];
  if (next === undefined) return [target === 'fg' ? '39' : '49'];
  return colorCodes(target, next, capabilities, forceColor);
}

function colorCodes(
  target: 'fg' | 'bg',
  color: TerminalColor | undefined,
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): readonly string[] {
  if (color === undefined || color.kind === 'theme') return [];
  const depth = forceColor === true ? Math.max(capabilities.color.depth, 8) : capabilities.color.depth;
  if (depth < 4) return [];
  if (color.kind === 'ansi') return ansiColorCodes(target, color.value, depth);
  return rgbColorCodes(target, color, depth);
}

function ansiColorCodes(target: 'fg' | 'bg', value: number, depth: number): readonly string[] {
  const normalized = Math.max(0, Math.min(255, Math.floor(value)));
  if (depth >= 8) return [target === 'fg' ? '38' : '48', '5', String(normalized)];
  const basic = ansi256ToBasicAnsi(normalized);
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
  if (depth >= 8) return [target === 'fg' ? '38' : '48', '5', String(rgbToAnsi256({ r, g, b }))];
  if (depth >= 4) return [String(basicAnsiCode(target, rgbToBasicAnsi({ r, g, b })))];
  return [];
}

function textAttributesAvailable(capabilities: TerminalOutputCapabilityProfile): boolean {
  return capabilities.textAttributes.support === 'supported'
    && capabilities.textAttributes.availability === 'available';
}

function colorsAvailable(
  capabilities: TerminalOutputCapabilityProfile,
  forceColor: boolean | undefined
): boolean {
  return forceColor === true || capabilities.color.depth >= 4;
}

function basicAnsiCode(target: 'fg' | 'bg', value: number): number {
  const base = target === 'fg' ? 30 : 40;
  const brightBase = target === 'fg' ? 90 : 100;
  return value < 8 ? base + value : brightBase + value - 8;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
