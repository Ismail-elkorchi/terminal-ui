import { clipTextCells, measureTextCells } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { DividerLineKind, DividerOrientation } from '../widgets/types.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import type { Rect } from './layout.ts';
import type { TerminalStyle } from './render-primitives.ts';
import { stringify } from './widget-props.ts';
import { mergeStyles, widgetStyle } from './widget-style.ts';

interface DividerGlyphs {
  readonly horizontal: string;
  readonly vertical: string;
}

export function renderDivider(widget: Widget, buffer: FrameBuffer, bounds: Rect): void {
  const orientation = dividerOrientation(widget);
  const style = dividerStyle(widget);
  if (orientation === 'vertical') {
    renderVerticalDivider(widget, buffer, bounds, style);
    return;
  }
  renderHorizontalDivider(widget, buffer, bounds, style);
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

function renderHorizontalDivider(widget: Widget, buffer: FrameBuffer, bounds: Rect, style: TerminalStyle | undefined): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = dividerGlyphs(widget).horizontal;
  const label = dividerLabel(widget);
  const text = label.length === 0
    ? glyph.repeat(bounds.width)
    : labelledDividerText(glyph, label, bounds.width, dividerLabelAlign(widget));
  buffer.write(bounds.row, bounds.column, [{
    text,
    ...(style === undefined ? {} : { style }),
    source: { kind: 'divider', role: 'separator' }
  }]);
}

function renderVerticalDivider(widget: Widget, buffer: FrameBuffer, bounds: Rect, style: TerminalStyle | undefined): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = dividerGlyphs(widget).vertical;
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: glyph,
      ...(style === undefined ? {} : { style }),
      source: { kind: 'divider', role: 'separator' }
    }]);
  }
}

function labelledDividerText(
  glyph: string,
  label: string,
  width: number,
  align: 'start' | 'center' | 'end'
): string {
  const clippedLabel = clipTextCells(` ${label} `, Math.max(0, width)).text;
  const labelCells = measureTextCells(clippedLabel).cells;
  const remaining = Math.max(0, width - labelCells);
  const before = align === 'end' ? remaining : align === 'center' ? Math.floor(remaining / 2) : 0;
  const after = remaining - before;
  return `${glyph.repeat(before)}${clippedLabel}${glyph.repeat(after)}`;
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

function dividerGlyphs(widget: Widget): DividerGlyphs {
  switch (dividerLineKind(widget)) {
    case 'single':
      return { horizontal: '─', vertical: '│' };
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
