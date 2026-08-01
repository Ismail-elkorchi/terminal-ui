import { clipTextCells, measureTextCells, oneCellGlyph } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { DividerLineKind, DividerOrientation } from '../../ui-model/menu.ts';
import type { RenderTarget } from '../contracts.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../contracts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { stringify } from './render-node-props.ts';
import { mergeStyles, renderNodeStyle } from '../style-resolution.ts';

interface DividerGlyphs {
  readonly horizontal: string;
  readonly vertical: string;
}

export function renderDivider(renderNode: DividerNode, buffer: RenderTarget, bounds: Rect, theme: TerminalTheme): void {
  const orientation = dividerOrientation(renderNode);
  const style = dividerStyle(renderNode);
  if (orientation === 'vertical') {
    renderVerticalDivider(renderNode, buffer, bounds, style, theme);
    return;
  }
  renderHorizontalDivider(renderNode, buffer, bounds, style, theme);
}

export function dividerAccessibleBase(renderNode: DividerNode, id: string, focused: boolean): AccessibleNode {
  const label = dividerLabel(renderNode);
  return {
    id,
    role: 'text',
    label: label.length === 0 ? id : label,
    ...(focused ? { focused } : {})
  };
}

export function dividerPreferredSize(
  renderNode: DividerNode,
  widthProfile: TextWidthProfile
): { readonly width: number; readonly height: number } {
  const label = dividerLabel(renderNode);
  const labelCells = measureTextCells(label, { widthProfile }).cells;
  return dividerOrientation(renderNode) === 'vertical'
    ? { width: 1, height: Math.max(1, labelCells) }
    : { width: Math.max(1, labelCells + (labelCells === 0 ? 0 : 2)), height: 1 };
}

function renderHorizontalDivider(
  renderNode: DividerNode,
  buffer: RenderTarget,
  bounds: Rect,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = oneCellGlyph(dividerGlyphs(renderNode, theme).horizontal, '-', {
    widthProfile: buffer.widthProfile
  });
  const label = dividerLabel(renderNode);
  const spans = label.length === 0
    ? [separatorSpan(renderNode, glyph.repeat(bounds.width), style)]
    : labelledDividerSpans(renderNode, glyph, label, bounds.width, dividerLabelAlign(renderNode), style, buffer.widthProfile);
  buffer.write(bounds.row, bounds.column, spans);
}

function renderVerticalDivider(
  renderNode: DividerNode,
  buffer: RenderTarget,
  bounds: Rect,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const glyph = oneCellGlyph(dividerGlyphs(renderNode, theme).vertical, '|', {
    widthProfile: buffer.widthProfile
  });
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: glyph,
      ...(style === undefined ? {} : { style }),
      source: renderNodeFrameSource(renderNode, {
        rendererFamily: 'drawing',
        cellRole: 'separator',
        partName: 'separator',
        description: 'separator'
      })
    }]);
  }
}

function labelledDividerSpans(
  renderNode: DividerNode,
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
    separatorSpan(renderNode, glyph.repeat(before), style, 'separator.before'),
    labelSpan(renderNode, clippedLabel, style),
    separatorSpan(renderNode, glyph.repeat(after), style, 'separator.after')
  ].filter((span) => span.text.length > 0);
}

function dividerOrientation(renderNode: DividerNode): DividerOrientation {
  return renderNode.props.orientation === 'vertical' ? 'vertical' : 'horizontal';
}

function dividerLineKind(renderNode: DividerNode): DividerLineKind {
  const value = renderNode.props.line;
  return value === 'double'
    || value === 'heavy'
    || value === 'dashed'
    || value === 'dotted'
    || value === 'ascii'
    || value === 'empty'
    ? value
    : 'single';
}

function dividerLabel(renderNode: DividerNode): string {
  return stringify(renderNode.props.label);
}

function dividerLabelAlign(renderNode: DividerNode): 'start' | 'center' | 'end' {
  const value = renderNode.props.labelAlign;
  return value === 'center' || value === 'end' ? value : 'start';
}

function dividerGlyphs(renderNode: DividerNode, theme: TerminalTheme): DividerGlyphs {
  switch (dividerLineKind(renderNode)) {
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

function dividerStyle(renderNode: DividerNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, 'border'), renderNode.styles?.root);
}

function dividerLabelStyle(renderNode: DividerNode, base: TerminalStyle | undefined): TerminalStyle | undefined {
  return mergeStyles(base, renderNodeStyle(renderNode, 'label'));
}

function separatorSpan(renderNode: DividerNode, text: string, style: TerminalStyle | undefined, label = 'separator'): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(renderNode, {
      rendererFamily: 'drawing',
      cellRole: 'separator',
      partName: label,
      description: label
    })
  };
}

function labelSpan(renderNode: DividerNode, text: string, baseStyle: TerminalStyle | undefined): RenderSpan {
  const style = dividerLabelStyle(renderNode, baseStyle);
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(renderNode, {
      rendererFamily: 'drawing',
      cellRole: 'text',
      partName: 'label',
      description: 'label'
    })
  };
}
type DividerNode = RenderNodeOfKind<unknown, 'divider'>;
