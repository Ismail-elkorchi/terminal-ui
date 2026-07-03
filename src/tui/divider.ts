import { clipTextCells, measureTextCells } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { DividerLineKind, DividerOrientation } from '../widgets/types.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import { widgetFrameSource } from './frame-source.ts';
import type { Rect } from './layout.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';
import { stringify } from './widget-props.ts';
import { mergeStyles, widgetStyle } from './widget-style.ts';

interface DividerGlyphs {
  readonly horizontal: string;
  readonly vertical: string;
}

export function renderDivider(widget: Widget, buffer: FrameBuffer, bounds: Rect, theme: TerminalTheme): void {
  const orientation = dividerOrientation(widget);
  const style = dividerStyle(widget);
  if (orientation === 'vertical') {
    renderVerticalDivider(widget, buffer, bounds, style, theme);
    return;
  }
  renderHorizontalDivider(widget, buffer, bounds, style, theme);
}

export function dividerAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const label = dividerLabel(widget);
  return {
    id,
    role: 'text',
    label: label.length === 0 ? id : label,
    ...(focused ? { focused } : {})
  };
}

export function dividerPreferredSize(widget: Widget): { readonly width: number; readonly height: number } {
  const label = dividerLabel(widget);
  const labelCells = measureTextCells(label).cells;
  return dividerOrientation(widget) === 'vertical'
    ? { width: 1, height: Math.max(1, labelCells) }
    : { width: Math.max(1, labelCells + (labelCells === 0 ? 0 : 2)), height: 1 };
}

function renderHorizontalDivider(
  widget: Widget,
  buffer: FrameBuffer,
  bounds: Rect,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = dividerGlyphs(widget, theme).horizontal;
  const label = dividerLabel(widget);
  const spans = label.length === 0
    ? [separatorSpan(widget, glyph.repeat(bounds.width), style)]
    : labelledDividerSpans(widget, glyph, label, bounds.width, dividerLabelAlign(widget), style);
  buffer.write(bounds.row, bounds.column, spans);
}

function renderVerticalDivider(
  widget: Widget,
  buffer: FrameBuffer,
  bounds: Rect,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = dividerGlyphs(widget, theme).vertical;
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: glyph,
      ...(style === undefined ? {} : { style }),
      source: widgetFrameSource(widget, { family: 'drawing', role: 'separator', part: 'separator', label: 'separator' })
    }]);
  }
}

function labelledDividerSpans(
  widget: Widget,
  glyph: string,
  label: string,
  width: number,
  align: 'start' | 'center' | 'end',
  style: TerminalStyle | undefined
): readonly RenderSpan[] {
  const clippedLabel = clipTextCells(` ${label} `, Math.max(0, width)).text;
  const labelCells = measureTextCells(clippedLabel).cells;
  const remaining = Math.max(0, width - labelCells);
  const before = align === 'end' ? remaining : align === 'center' ? Math.floor(remaining / 2) : 0;
  const after = remaining - before;
  return [
    separatorSpan(widget, glyph.repeat(before), style, 'separator.before'),
    labelSpan(widget, clippedLabel, style),
    separatorSpan(widget, glyph.repeat(after), style, 'separator.after')
  ].filter((span) => span.text.length > 0);
}

function dividerOrientation(widget: Widget): DividerOrientation {
  return widget.props['orientation'] === 'vertical' ? 'vertical' : 'horizontal';
}

function dividerLineKind(widget: Widget): DividerLineKind {
  const value = widget.props['line'];
  return value === 'double'
    || value === 'heavy'
    || value === 'dashed'
    || value === 'dotted'
    || value === 'ascii'
    || value === 'empty'
    ? value
    : 'single';
}

function dividerLabel(widget: Widget): string {
  return stringify(widget.props['label']);
}

function dividerLabelAlign(widget: Widget): 'start' | 'center' | 'end' {
  const value = widget.props['labelAlign'];
  return value === 'center' || value === 'end' ? value : 'start';
}

function dividerGlyphs(widget: Widget, theme: TerminalTheme): DividerGlyphs {
  switch (dividerLineKind(widget)) {
    case 'single':
      return {
        horizontal: theme.symbols.borderSingle.horizontal,
        vertical: theme.symbols.borderSingle.vertical
      };
    case 'double':
      return { horizontal: '═', vertical: '║' };
    case 'heavy':
      return { horizontal: '━', vertical: '┃' };
    case 'dashed':
      return { horizontal: '┄', vertical: '┆' };
    case 'dotted':
      return { horizontal: '┈', vertical: '┊' };
    case 'ascii':
      return { horizontal: '-', vertical: '|' };
    case 'empty':
      return { horizontal: ' ', vertical: ' ' };
  }
}

function dividerStyle(widget: Widget): TerminalStyle | undefined {
  return mergeStyles(widgetStyle(widget, 'border'), widget.styles?.root);
}

function dividerLabelStyle(widget: Widget, base: TerminalStyle | undefined): TerminalStyle | undefined {
  return mergeStyles(base, widgetStyle(widget, 'label'));
}

function separatorSpan(widget: Widget, text: string, style: TerminalStyle | undefined, label = 'separator'): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: widgetFrameSource(widget, { family: 'drawing', role: 'separator', part: label, label })
  };
}

function labelSpan(widget: Widget, text: string, baseStyle: TerminalStyle | undefined): RenderSpan {
  const style = dividerLabelStyle(widget, baseStyle);
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: widgetFrameSource(widget, { family: 'drawing', role: 'text', part: 'label', label: 'label' })
  };
}
