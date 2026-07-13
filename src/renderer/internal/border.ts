import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type {
  BorderStyle,
  BorderTitle,
  BorderTitleContent,
  BorderTitleRail
} from '../../visual/border.ts';
import { frameCellSource } from '../../visual/source.ts';
import type { TerminalColor, TerminalStyle } from './frame.ts';
import type { RenderTarget } from '../model/render-target.ts';
import type { Rect } from '../model/layout.ts';
import { clipRenderSpans, measureRenderSpans, span } from '../../visual/render.ts';
import type { RenderSpan } from '../../visual/render.ts';

export type { BorderKind, BorderStyle, BorderTitle, BorderTitleContent, BorderTitleRail } from '../../visual/border.ts';

interface BorderGlyphs {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

export function drawBorder(
  buffer: RenderTarget,
  bounds: Rect,
  border: BorderStyle | undefined,
  theme: TerminalTheme
): void {
  const style = border ?? { kind: 'single' };
  if (style.kind === 'none' || bounds.width <= 0 || bounds.height <= 0) return;
  const glyphs = glyphsForBorder(style.kind, theme);
  const terminalStyle = style.style;

  if (bounds.height === 1) {
    writeBorderLine(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', style.title, style.titleAlign, terminalStyle));
    return;
  }

  writeBorderLine(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', style.title, style.titleAlign, terminalStyle));
  for (let row = bounds.row + 1; row < bounds.row + bounds.height - 1; row += 1) {
    writeBorderText(buffer, row, bounds.column, glyphs.vertical, terminalStyle);
    if (bounds.width > 1) {
      writeBorderText(buffer, row, bounds.column + bounds.width - 1, glyphs.vertical, terminalStyle);
    }
  }
  writeBorderLine(
    buffer,
    bounds.row + bounds.height - 1,
    bounds.column,
    horizontalLine(bounds.width, glyphs, 'bottom', undefined, undefined, terminalStyle)
  );
}

function horizontalLine(
  width: number,
  glyphs: BorderGlyphs,
  position: 'top' | 'bottom',
  title?: BorderTitle,
  titleAlign: BorderStyle['titleAlign'] = 'start',
  style?: TerminalStyle
): readonly RenderSpan[] {
  if (width <= 1) return [borderSpan(position === 'top' ? glyphs.topLeft : glyphs.bottomLeft, style, 'border.corner')];
  const left = position === 'top' ? glyphs.topLeft : glyphs.bottomLeft;
  const right = position === 'top' ? glyphs.topRight : glyphs.bottomRight;
  const innerWidth = Math.max(0, width - 2);
  if (position === 'bottom' || title === undefined || titleLength(title) === 0 || innerWidth <= 0) {
    return [
      borderSpan(left, style, 'border.corner'),
      borderSpan(glyphs.horizontal.repeat(innerWidth), style, 'border.edge'),
      borderSpan(right, style, 'border.corner')
    ];
  }
  if (isBorderTitleRail(title)) {
    return [
      borderSpan(left, style, 'border.corner'),
      ...titleRailSpans(title, innerWidth, glyphs.horizontal, style),
      borderSpan(right, style, 'border.corner')
    ];
  }
  const clippedTitle = clipRenderSpans(titleSpans(title, style), innerWidth);
  const remaining = Math.max(0, innerWidth - measureRenderSpans(clippedTitle));
  const before = titleAlign === 'end' ? remaining : titleAlign === 'center' ? Math.floor(remaining / 2) : 0;
  const after = remaining - before;
  return [
    borderSpan(left, style, 'border.corner'),
    borderSpan(glyphs.horizontal.repeat(before), style, 'border.edge'),
    ...clippedTitle,
    borderSpan(glyphs.horizontal.repeat(after), style, 'border.edge'),
    borderSpan(right, style, 'border.corner')
  ];
}

export function borderStyleFromValue(value: unknown): BorderStyle | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (!isBorderKind(kind)) return undefined;
  const title = borderTitleFromValue(value['title']);
  const titleAlign = value['titleAlign'];
  const style = terminalStyleFromValue(value['style']);
  const focusStyle = terminalStyleFromValue(value['focusStyle']);
  return {
    kind,
    ...(title === undefined ? {} : { title }),
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
  if (kind === 'single') return theme.tokens.symbols.borderSingle;
  if (kind === 'rounded') return theme.tokens.symbols.borderRounded;
  if (kind === 'ascii') return asciiGlyphs;
  if (kind === 'double') return doubleGlyphs;
  if (kind === 'dashed') return dashedGlyphs;
  if (kind === 'dotted') return dottedGlyphs;
  if (kind === 'empty') return emptyGlyphs;
  return heavyGlyphs;
}

function writeBorderText(
  buffer: RenderTarget,
  row: number,
  column: number,
  text: string,
  style: TerminalStyle | undefined
): void {
  writeBorderLine(buffer, row, column, [borderSpan(text, style, 'border')]);
}

function writeBorderLine(
  buffer: RenderTarget,
  row: number,
  column: number,
  spans: readonly RenderSpan[]
): void {
  buffer.write(row, column, spans);
}

function titleLength(title: BorderTitle): number {
  if (isBorderTitleRail(title)) {
    return titleRailContents(title).reduce((sum, currentTitle) => sum + measureRenderSpans(titleSpans(currentTitle, undefined)), 0);
  }
  return typeof title === 'string' ? sanitizeTerminalText(title).text.length : measureRenderSpans(title);
}

export function borderTitleText(title: BorderTitle | undefined): string {
  if (title === undefined) return '';
  if (isBorderTitleRail(title)) {
    return titleRailContents(title)
      .map((currentTitle) => borderTitleContentText(currentTitle))
      .filter((text) => text.length > 0)
      .join(' ');
  }
  return borderTitleContentText(title);
}

function borderTitleContentText(title: BorderTitleContent): string {
  if (typeof title === 'string') return sanitizeTerminalText(title).text;
  return sanitizeTerminalText(title.map((currentSpan) => currentSpan.text).join('')).text;
}

function titleSpans(title: BorderTitleContent, style: TerminalStyle | undefined): readonly RenderSpan[] {
  if (typeof title === 'string') {
    const text = sanitizeTerminalText(title).text;
    return text.length === 0 ? [] : [borderSpan(` ${text} `, style, 'border.title')];
  }
  return [
    borderSpan(' ', style, 'border.title.padding'),
    ...title.map((currentSpan, index) => sanitizeTitleSpan(currentSpan, style, index)),
    borderSpan(' ', style, 'border.title.padding')
  ];
}

function titleRailSpans(
  rail: BorderTitleRail,
  innerWidth: number,
  horizontal: string,
  style: TerminalStyle | undefined
): readonly RenderSpan[] {
  const start = titleContentSpans(rail.start, style);
  const center = titleContentSpans(rail.center, style);
  const end = titleContentSpans(rail.end, style);
  const pieces: RenderSpan[] = [];
  let cursor = 0;

  cursor = appendRailSegment(pieces, cursor, 0, innerWidth, start, horizontal, style);

  const centerWidth = measureRenderSpans(center);
  const centerColumn = Math.max(cursor, Math.floor((innerWidth - centerWidth) / 2));
  cursor = appendRailSegment(pieces, cursor, centerColumn, innerWidth, center, horizontal, style);

  const endWidth = measureRenderSpans(end);
  const endColumn = Math.max(cursor, innerWidth - endWidth);
  cursor = appendRailSegment(pieces, cursor, endColumn, innerWidth, end, horizontal, style);

  if (cursor < innerWidth) pieces.push(borderSpan(horizontal.repeat(innerWidth - cursor), style, 'border.edge'));
  return pieces;
}

function appendRailSegment(
  output: RenderSpan[],
  cursor: number,
  column: number,
  innerWidth: number,
  spans: readonly RenderSpan[],
  horizontal: string,
  style: TerminalStyle | undefined
): number {
  if (cursor >= innerWidth) return cursor;
  const start = Math.max(cursor, Math.min(innerWidth, column));
  if (start > cursor) {
    output.push(borderSpan(horizontal.repeat(start - cursor), style, 'border.edge'));
  }
  const budget = Math.max(0, innerWidth - start);
  const clipped = clipRenderSpans(spans, budget);
  output.push(...clipped);
  return start + measureRenderSpans(clipped);
}

function titleContentSpans(title: BorderTitleContent | undefined, style: TerminalStyle | undefined): readonly RenderSpan[] {
  return title === undefined ? [] : titleSpans(title, style);
}

function isBorderTitleRail(value: BorderTitle): value is BorderTitleRail {
  return typeof value === 'object'
    && !Array.isArray(value)
    && ('start' in value || 'center' in value || 'end' in value);
}

function titleRailContents(rail: BorderTitleRail): readonly BorderTitleContent[] {
  return [rail.start, rail.center, rail.end].filter((value): value is BorderTitleContent => value !== undefined);
}

function borderTitleFromValue(value: unknown): BorderTitle | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const spans = value.filter(isRenderSpan).map((currentSpan, index) => sanitizeTitleSpan(currentSpan, undefined, index));
    return spans.length === 0 ? undefined : spans;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const rail = {
    ...borderTitleRailPart('start', value),
    ...borderTitleRailPart('center', value),
    ...borderTitleRailPart('end', value)
  };
  return Object.keys(rail).length === 0 ? undefined : rail;
}

function borderTitleRailPart<TKey extends keyof BorderTitleRail>(
  key: TKey,
  value: object
): Pick<BorderTitleRail, TKey> | Record<string, never> {
  const part = (value as Record<string, unknown>)[key];
  const title = borderTitleFromValue(part);
  return title === undefined ? {} : { [key]: title } as Pick<BorderTitleRail, TKey>;
}

function isRenderSpan(value: unknown): value is RenderSpan {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly text?: unknown }).text === 'string';
}

function sanitizeTitleSpan(currentSpan: RenderSpan, style: TerminalStyle | undefined, index: number): RenderSpan {
  const text = sanitizeTerminalText(currentSpan.text).text;
  return {
    text,
    ...(currentSpan.style === undefined && style !== undefined ? { style } : {}),
    ...(currentSpan.style === undefined ? {} : { style: currentSpan.style }),
    ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
    source: currentSpan.source ?? frameCellSource({
      ownerKind: 'border',
      family: 'surface',
      role: 'text',
      part: `border.title.${String(index)}`,
      partKind: 'title',
      label: `border.title.${String(index)}`
    })
  };
}

function borderSpan(text: string, style: TerminalStyle | undefined, label: string): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: frameCellSource({ ownerKind: 'border', family: 'surface', role: 'border', part: label, label })
  });
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
