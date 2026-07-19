import { clipTextCells, measureTextCells, oneCellGlyph } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { DividerLineKind, DividerOrientation } from '../../ui-model/menu.ts';
import type { RenderTarget } from '../model/render-target.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../model/layout.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { stringify } from './render-node-props.ts';
import { mergeStyles, renderNodeStyle } from './render-node-style.ts';

interface DividerGlyphs {
  readonly horizontal: string;
  readonly vertical: string;
}

export function renderDivider(widget: DividerNode, buffer: RenderTarget, bounds: Rect, theme: TerminalTheme): void {
  const orientation = dividerOrientation(widget);
  const style = dividerStyle(widget);
  if (orientation === 'vertical') {
    renderVerticalDivider(widget, buffer, bounds, style, theme);
    return;
  }
  renderHorizontalDivider(widget, buffer, bounds, style, theme);
}

export function dividerAccessibleBase(widget: DividerNode, id: string, focused: boolean): AccessibleNode {
  const label = dividerLabel(widget);
  return {
    id,
    role: 'text',
    label: label.length === 0 ? id : label,
    ...(focused ? { focused } : {})
  };
}

export function dividerPreferredSize(
  widget: DividerNode,
  widthProfile: TextWidthProfile
): { readonly width: number; readonly height: number } {
  const label = dividerLabel(widget);
  const labelCells = measureTextCells(label, { widthProfile }).cells;
  return dividerOrientation(widget) === 'vertical'
    ? { width: 1, height: Math.max(1, labelCells) }
    : { width: Math.max(1, labelCells + (labelCells === 0 ? 0 : 2)), height: 1 };
}

function renderHorizontalDivider(
  widget: DividerNode,
  buffer: RenderTarget,
  bounds: Rect,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = oneCellGlyph(dividerGlyphs(widget, theme).horizontal, '-', {
    widthProfile: buffer.widthProfile
  });
  const label = dividerLabel(widget);
  const spans = label.length === 0
    ? [separatorSpan(widget, glyph.repeat(bounds.width), style)]
    : labelledDividerSpans(widget, glyph, label, bounds.width, dividerLabelAlign(widget), style, buffer.widthProfile);
  buffer.write(bounds.row, bounds.column, spans);
}

function renderVerticalDivider(
  widget: DividerNode,
  buffer: RenderTarget,
  bounds: Rect,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = oneCellGlyph(dividerGlyphs(widget, theme).vertical, '|', {
    widthProfile: buffer.widthProfile
  });
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: glyph,
      ...(style === undefined ? {} : { style }),
      source: renderNodeFrameSource(widget, { family: 'drawing', role: 'separator', part: 'separator', label: 'separator' })
    }]);
  }
}

function labelledDividerSpans(
  widget: DividerNode,
  glyph: string,
  label: string,
  width: number,
  align: 'start' | 'center' | 'end',
  style: TerminalStyle | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const clippedLabel = clipTextCells(` ${label} `, Math.max(0, width), { widthProfile }).text;
  const labelCells = measureTextCells(clippedLabel, { widthProfile }).cells;
  const remaining = Math.max(0, width - labelCells);
  const before = align === 'end' ? remaining : align === 'center' ? Math.floor(remaining / 2) : 0;
  const after = remaining - before;
  return [
    separatorSpan(widget, glyph.repeat(before), style, 'separator.before'),
    labelSpan(widget, clippedLabel, style),
    separatorSpan(widget, glyph.repeat(after), style, 'separator.after')
  ].filter((span) => span.text.length > 0);
}

function dividerOrientation(widget: DividerNode): DividerOrientation {
  return widget.props.orientation === 'vertical' ? 'vertical' : 'horizontal';
}

function dividerLineKind(widget: DividerNode): DividerLineKind {
  const value = widget.props.line;
  return value === 'double'
    || value === 'heavy'
    || value === 'dashed'
    || value === 'dotted'
    || value === 'ascii'
    || value === 'empty'
    ? value
    : 'single';
}

function dividerLabel(widget: DividerNode): string {
  return stringify(widget.props.label);
}

function dividerLabelAlign(widget: DividerNode): 'start' | 'center' | 'end' {
  const value = widget.props.labelAlign;
  return value === 'center' || value === 'end' ? value : 'start';
}

function dividerGlyphs(widget: DividerNode, theme: TerminalTheme): DividerGlyphs {
  switch (dividerLineKind(widget)) {
    case 'single':
      return {
        horizontal: theme.tokens.symbols.borderSingle.horizontal,
        vertical: theme.tokens.symbols.borderSingle.vertical
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

function dividerStyle(widget: DividerNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(widget, 'border'), widget.styles?.root);
}

function dividerLabelStyle(widget: DividerNode, base: TerminalStyle | undefined): TerminalStyle | undefined {
  return mergeStyles(base, renderNodeStyle(widget, 'label'));
}

function separatorSpan(widget: DividerNode, text: string, style: TerminalStyle | undefined, label = 'separator'): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(widget, { family: 'drawing', role: 'separator', part: label, label })
  };
}

function labelSpan(widget: DividerNode, text: string, baseStyle: TerminalStyle | undefined): RenderSpan {
  const style = dividerLabelStyle(widget, baseStyle);
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(widget, { family: 'drawing', role: 'text', part: 'label', label: 'label' })
  };
}
type DividerNode = RenderNodeOfKind<unknown, 'divider'>;
