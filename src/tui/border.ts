import { clipTextCells } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TerminalStyle } from './frame.ts';
import type { FrameBuffer } from './frame.ts';
import type { Rect } from './layout.ts';

export interface BorderStyle {
  readonly kind: 'none' | 'single' | 'double' | 'rounded' | 'heavy' | 'ascii';
  readonly title?: string;
  readonly style?: TerminalStyle;
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
    writeBorderText(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', style.title), terminalStyle);
    return;
  }

  writeBorderText(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', style.title), terminalStyle);
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
  title?: string
): string {
  if (width <= 1) return position === 'top' ? glyphs.topLeft : glyphs.bottomLeft;
  const left = position === 'top' ? glyphs.topLeft : glyphs.bottomLeft;
  const right = position === 'top' ? glyphs.topRight : glyphs.bottomRight;
  const innerWidth = Math.max(0, width - 2);
  const base = `${left}${glyphs.horizontal.repeat(innerWidth)}${right}`;
  if (position === 'bottom' || title === undefined || title.length === 0 || innerWidth <= 0) return base;
  const clippedTitle = clipTextCells(` ${title} `, innerWidth);
  return `${left}${clippedTitle.text}${glyphs.horizontal.repeat(Math.max(0, innerWidth - clippedTitle.cells))}${right}`;
}

function glyphsForBorder(kind: Exclude<BorderStyle['kind'], 'none'>, theme: TerminalTheme): BorderGlyphs {
  if (kind === 'single') return theme.symbols.borderSingle;
  if (kind === 'rounded') return theme.symbols.borderRounded;
  if (kind === 'ascii') return asciiGlyphs;
  if (kind === 'double') return doubleGlyphs;
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
    ...(style === undefined ? {} : { style })
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
