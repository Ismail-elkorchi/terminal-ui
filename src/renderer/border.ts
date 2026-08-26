import { oneCellGlyph, sanitizeTerminalText } from '../text/index.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { BorderKind } from '../visual/border.ts';
import { frameCellSource } from '../visual/frame-source.ts';
import type { TerminalStyle } from './frame.ts';
import type { RenderTarget } from './contracts.ts';
import type { Rect } from './contracts.ts';
import { clipRenderSpans, measureRenderSpans, span } from '../visual/render-content.ts';
import type { RenderSpan } from '../visual/render-content.ts';

export type { BorderKind } from '../visual/border.ts';

export type BorderTitleContent = string | readonly RenderSpan[];

export interface BorderTitleSlots {
  readonly start?: BorderTitleContent;
  readonly center?: BorderTitleContent;
  readonly end?: BorderTitleContent;
}

export type BorderTitle = BorderTitleContent | BorderTitleSlots;

export interface BorderStyle {
  readonly kind: BorderKind;
  readonly title?: BorderTitle;
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
  buffer: RenderTarget,
  bounds: Rect,
  border: BorderStyle | undefined,
  theme: TerminalTheme
): void {
  const style = border ?? { kind: 'single' };
  if (style.kind === 'none' || bounds.width <= 0 || bounds.height <= 0) return;
  const glyphs = glyphsForBorder(style.kind, theme, buffer.widthProfile);
  const terminalStyle = style.style;

  if (bounds.height === 1) {
    writeBorderLine(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', buffer.widthProfile, style.title, style.titleAlign, terminalStyle));
    return;
  }

  writeBorderLine(buffer, bounds.row, bounds.column, horizontalLine(bounds.width, glyphs, 'top', buffer.widthProfile, style.title, style.titleAlign, terminalStyle));
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
    horizontalLine(bounds.width, glyphs, 'bottom', buffer.widthProfile, undefined, undefined, terminalStyle)
  );
}

function horizontalLine(
  width: number,
  glyphs: BorderGlyphs,
  position: 'top' | 'bottom',
  widthProfile: TextWidthProfile,
  title?: BorderTitle,
  titleAlign: BorderStyle['titleAlign'] = 'start',
  style?: TerminalStyle
): readonly RenderSpan[] {
  if (width <= 1) return [borderSpan(position === 'top' ? glyphs.topLeft : glyphs.bottomLeft, style, 'border.corner')];
  const left = position === 'top' ? glyphs.topLeft : glyphs.bottomLeft;
  const right = position === 'top' ? glyphs.topRight : glyphs.bottomRight;
  const innerWidth = Math.max(0, width - 2);
  if (position === 'bottom' || title === undefined || titleLength(title, widthProfile) === 0 || innerWidth <= 0) {
    return [
      borderSpan(left, style, 'border.corner'),
      borderSpan(glyphs.horizontal.repeat(innerWidth), style, 'border.edge'),
      borderSpan(right, style, 'border.corner')
    ];
  }
  if (isBorderTitleSlots(title)) {
    return [
      borderSpan(left, style, 'border.corner'),
      ...titleSlotSpans(title, innerWidth, glyphs.horizontal, style, widthProfile),
      borderSpan(right, style, 'border.corner')
    ];
  }
  const clippedTitle = clipRenderSpans(titleSpans(title, style), innerWidth, { widthProfile });
  const remaining = Math.max(0, innerWidth - measureRenderSpans(clippedTitle, { widthProfile }));
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
  if (!isNonArrayObject(value)) return undefined;
  const kind = value['kind'];
  if (!isBorderKind(kind)) return undefined;
  const titleAlign = value['titleAlign'];
  return {
    kind,
    ...(isTitleAlign(titleAlign) ? { titleAlign } : {})
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

function glyphsForBorder(
  kind: Exclude<BorderStyle['kind'], 'none'>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): BorderGlyphs {
  const preferred = kind === 'single'
    ? theme.tokens.symbols.borderSingle
    : kind === 'rounded'
      ? theme.tokens.symbols.borderRounded
      : kind === 'ascii'
        ? asciiGlyphs
        : kind === 'double'
          ? doubleGlyphs
          : kind === 'dashed'
            ? dashedGlyphs
            : kind === 'dotted'
              ? dottedGlyphs
              : kind === 'empty'
                ? emptyGlyphs
                : heavyGlyphs;
  return {
    topLeft: oneCellGlyph(preferred.topLeft, asciiGlyphs.topLeft, { widthProfile }),
    topRight: oneCellGlyph(preferred.topRight, asciiGlyphs.topRight, { widthProfile }),
    bottomLeft: oneCellGlyph(preferred.bottomLeft, asciiGlyphs.bottomLeft, { widthProfile }),
    bottomRight: oneCellGlyph(preferred.bottomRight, asciiGlyphs.bottomRight, { widthProfile }),
    horizontal: oneCellGlyph(preferred.horizontal, asciiGlyphs.horizontal, { widthProfile }),
    vertical: oneCellGlyph(preferred.vertical, asciiGlyphs.vertical, { widthProfile })
  };
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

function titleLength(title: BorderTitle, widthProfile: TextWidthProfile): number {
  if (isBorderTitleSlots(title)) {
    return titleSlotContents(title).reduce(
      (sum, currentTitle) => sum + measureRenderSpans(titleSpans(currentTitle, undefined), { widthProfile }),
      0
    );
  }
  return measureRenderSpans(titleSpans(title, undefined), { widthProfile });
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

function titleSlotSpans(
  slots: BorderTitleSlots,
  innerWidth: number,
  horizontal: string,
  style: TerminalStyle | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const start = titleContentSpans(slots.start, style);
  const center = titleContentSpans(slots.center, style);
  const end = titleContentSpans(slots.end, style);
  const pieces: RenderSpan[] = [];
  let cursor = 0;

  cursor = appendTitleSlot(pieces, cursor, 0, innerWidth, start, horizontal, style, widthProfile);

  const centerWidth = measureRenderSpans(center, { widthProfile });
  const centerColumn = Math.max(cursor, Math.floor((innerWidth - centerWidth) / 2));
  cursor = appendTitleSlot(pieces, cursor, centerColumn, innerWidth, center, horizontal, style, widthProfile);

  const endWidth = measureRenderSpans(end, { widthProfile });
  const endColumn = Math.max(cursor, innerWidth - endWidth);
  cursor = appendTitleSlot(pieces, cursor, endColumn, innerWidth, end, horizontal, style, widthProfile);

  if (cursor < innerWidth) pieces.push(borderSpan(horizontal.repeat(innerWidth - cursor), style, 'border.edge'));
  return pieces;
}

function appendTitleSlot(
  output: RenderSpan[],
  cursor: number,
  column: number,
  innerWidth: number,
  spans: readonly RenderSpan[],
  horizontal: string,
  style: TerminalStyle | undefined,
  widthProfile: TextWidthProfile
): number {
  if (cursor >= innerWidth) return cursor;
  const start = Math.max(cursor, Math.min(innerWidth, column));
  if (start > cursor) {
    output.push(borderSpan(horizontal.repeat(start - cursor), style, 'border.edge'));
  }
  const budget = Math.max(0, innerWidth - start);
  const clipped = clipRenderSpans(spans, budget, { widthProfile });
  output.push(...clipped);
  return start + measureRenderSpans(clipped, { widthProfile });
}

function titleContentSpans(title: BorderTitleContent | undefined, style: TerminalStyle | undefined): readonly RenderSpan[] {
  return title === undefined ? [] : titleSpans(title, style);
}

function isBorderTitleSlots(value: BorderTitle): value is BorderTitleSlots {
  return typeof value === 'object'
    && !Array.isArray(value)
    && ('start' in value || 'center' in value || 'end' in value);
}

function titleSlotContents(slots: BorderTitleSlots): readonly BorderTitleContent[] {
  return [slots.start, slots.center, slots.end].filter((value): value is BorderTitleContent => value !== undefined);
}

function sanitizeTitleSpan(currentSpan: RenderSpan, style: TerminalStyle | undefined, index: number): RenderSpan {
  const text = sanitizeTerminalText(currentSpan.text).text;
  return {
    text,
    ...(currentSpan.style === undefined && style !== undefined ? { style } : {}),
    ...(currentSpan.style === undefined ? {} : { style: currentSpan.style }),
    ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
    source: currentSpan.source ?? frameCellSource({
      elementKind: 'border',
      rendererFamily: 'surface',
      cellRole: 'text',
      partName: `border.title.${String(index)}`,
      partType: 'title',
      description: `border.title.${String(index)}`
    })
  };
}

function borderSpan(text: string, style: TerminalStyle | undefined, label: string): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: frameCellSource({
      elementKind: 'border',
      rendererFamily: 'surface',
      cellRole: 'border',
      partName: label,
      description: label
    })
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
