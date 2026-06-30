import { clipTextCells } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TerminalColor, TerminalStyle } from './frame.ts';
import type { FrameBuffer } from './frame.ts';
import type { Rect } from './layout.ts';

export type BorderKind = 'none' | 'single' | 'double' | 'rounded' | 'heavy' | 'ascii' | 'dashed' | 'dotted' | 'empty';
export interface BorderStyle {
  readonly kind: BorderKind;
  readonly title?: string;
  readonly titleAlign?: 'start' | 'center' | 'end';
  readonly style?: TerminalStyle;
  readonly focusStyle?: TerminalStyle;
}

interface BorderGlyphs {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

export function drawBorder(
  buffer: FrameBuffer,
  bounds: Rect,
  border: BorderStyle | undefined,
  theme: TerminalTheme
): void {
  const style = border ?? { kind: 'single' };
  if (style.kind === 'none' || bounds.width <= 0 || bounds.height <= 0) return;
  const glyphs = glyphsForBorder(style.kind, theme);
  const terminalStyle = style.style;

  if (bounds.height === 1) {
    writeBorderText(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', style.title, style.titleAlign), terminalStyle);
    return;
  }

  writeBorderText(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', style.title, style.titleAlign), terminalStyle);
  for (let row = bounds.row + 1; row < bounds.row + bounds.height - 1; row += 1) {
    writeBorderText(buffer, row, bounds.column, glyphs.vertical, terminalStyle);
    if (bounds.width > 1) {
      writeBorderText(buffer, row, bounds.column + bounds.width - 1, glyphs.vertical, terminalStyle);
    }
  }
  writeBorderText(
    buffer,
    bounds.row + bounds.height - 1,
    bounds.column,
    horizontalLine(bounds.width, glyphs, 'bottom'),
    terminalStyle
  );
}

function horizontalLine(
  width: number,
  glyphs: BorderGlyphs,
  position: 'top' | 'bottom',
  title?: string,
  titleAlign: BorderStyle['titleAlign'] = 'start'
): string {
  if (width <= 1) return position === 'top' ? glyphs.topLeft : glyphs.bottomLeft;
  const left = position === 'top' ? glyphs.topLeft : glyphs.bottomLeft;
  const right = position === 'top' ? glyphs.topRight : glyphs.bottomRight;
  const innerWidth = Math.max(0, width - 2);
  const base = `${left}${glyphs.horizontal.repeat(innerWidth)}${right}`;
  if (position === 'bottom' || title === undefined || title.length === 0 || innerWidth <= 0) return base;
  const clippedTitle = clipTextCells(` ${title} `, innerWidth);
  const remaining = Math.max(0, innerWidth - clippedTitle.cells);
  const before = titleAlign === 'end' ? remaining : titleAlign === 'center' ? Math.floor(remaining / 2) : 0;
  const after = remaining - before;
  return `${left}${glyphs.horizontal.repeat(before)}${clippedTitle.text}${glyphs.horizontal.repeat(after)}${right}`;
}

export function borderStyleFromValue(value: unknown): BorderStyle | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (!isBorderKind(kind)) return undefined;
  const title = value['title'];
  const titleAlign = value['titleAlign'];
  const style = terminalStyleFromValue(value['style']);
  const focusStyle = terminalStyleFromValue(value['focusStyle']);
  return {
    kind,
    ...(typeof title === 'string' ? { title } : {}),
    ...(isTitleAlign(titleAlign) ? { titleAlign } : {}),
    ...(style === undefined ? {} : { style }),
    ...(focusStyle === undefined ? {} : { focusStyle })
  };
}

export function isBorderKind(value: unknown): value is BorderStyle['kind'] {
  return value === 'none'
    || value === 'single'
    || value === 'double'
    || value === 'rounded'
    || value === 'heavy'
    || value === 'ascii'
    || value === 'dashed'
    || value === 'dotted'
    || value === 'empty';
}

function glyphsForBorder(kind: Exclude<BorderStyle['kind'], 'none'>, theme: TerminalTheme): BorderGlyphs {
  if (kind === 'single') return theme.symbols.borderSingle;
  if (kind === 'rounded') return theme.symbols.borderRounded;
  if (kind === 'ascii') return asciiGlyphs;
  if (kind === 'double') return doubleGlyphs;
  if (kind === 'dashed') return dashedGlyphs;
  if (kind === 'dotted') return dottedGlyphs;
  if (kind === 'empty') return emptyGlyphs;
  return heavyGlyphs;
}

function writeBorderText(
  buffer: FrameBuffer,
  row: number,
  column: number,
  text: string,
  style: TerminalStyle | undefined
): void {
  buffer.write(row, column, [{
    text,
    ...(style === undefined ? {} : { style }),
    source: { kind: 'box', role: 'border' }
  }]);
}

const asciiGlyphs: BorderGlyphs = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|'
};

const doubleGlyphs: BorderGlyphs = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║'
};

const heavyGlyphs: BorderGlyphs = {
  topLeft: '┏',
  topRight: '┓',
  bottomLeft: '┗',
  bottomRight: '┛',
  horizontal: '━',
  vertical: '┃'
};

const dashedGlyphs: BorderGlyphs = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '┄',
  vertical: '┆'
};

const dottedGlyphs: BorderGlyphs = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '┈',
  vertical: '┊'
};

const emptyGlyphs: BorderGlyphs = {
  topLeft: ' ',
  topRight: ' ',
  bottomLeft: ' ',
  bottomRight: ' ',
  horizontal: ' ',
  vertical: ' '
};

function isTitleAlign(value: unknown): value is NonNullable<BorderStyle['titleAlign']> {
  return value === 'start' || value === 'center' || value === 'end';
}

function terminalStyleFromValue(value: unknown): TerminalStyle | undefined {
  if (!isRecord(value)) return undefined;
  const fg = terminalColorFromValue(value['fg']);
  const bg = terminalColorFromValue(value['bg']);
  return {
    ...(fg === undefined ? {} : { fg }),
    ...(bg === undefined ? {} : { bg }),
    ...(typeof value['bold'] === 'boolean' ? { bold: value['bold'] } : {}),
    ...(typeof value['dim'] === 'boolean' ? { dim: value['dim'] } : {}),
    ...(typeof value['italic'] === 'boolean' ? { italic: value['italic'] } : {}),
    ...(typeof value['underline'] === 'boolean' ? { underline: value['underline'] } : {}),
    ...(typeof value['strikethrough'] === 'boolean' ? { strikethrough: value['strikethrough'] } : {}),
    ...(typeof value['inverse'] === 'boolean' ? { inverse: value['inverse'] } : {}),
    ...(typeof value['hidden'] === 'boolean' ? { hidden: value['hidden'] } : {})
  };
}

function terminalColorFromValue(value: unknown): TerminalColor | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (kind === 'ansi') {
    const color = value['value'];
    return typeof color === 'number' && Number.isFinite(color) ? { kind, value: color } : undefined;
  }
  if (kind === 'rgb') {
    const r = value['r'];
    const g = value['g'];
    const b = value['b'];
    return typeof r === 'number' && Number.isFinite(r)
      && typeof g === 'number' && Number.isFinite(g)
      && typeof b === 'number' && Number.isFinite(b)
      ? { kind, r, g, b }
      : undefined;
  }
  if (kind === 'theme') {
    const token = value['token'];
    return typeof token === 'string' ? { kind, token } : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
