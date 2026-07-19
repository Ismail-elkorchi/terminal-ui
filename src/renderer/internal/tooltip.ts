import type { RenderNodeOfKind } from '../model/index.ts';
import { clipTextCells, measureTextCells } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { RenderTarget } from '../model/render-target.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../model/layout.ts';
import type { FrameCellSource, TerminalStyle } from '../../visual/render.ts';
import { stringify } from './render-node-props.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { TooltipTone } from '../../ui-model/menu.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface TooltipSize {
  readonly width: number;
  readonly height: number;
}

export type TooltipVisualKind = 'background' | 'content';

export function renderTooltip(widget: TooltipNode, buffer: RenderTarget, bounds: Rect, theme: TerminalTheme): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const tone = tooltipTone(widget);
  const border = tooltipBorder(widget, tone);
  fillTooltipBackground(widget, buffer, bounds, tooltipBackgroundStyle(tone));
  drawBorder(buffer, bounds, border, theme);
  const contentBounds = {
    row: bounds.row + 1,
    column: bounds.column + 1,
    width: Math.max(0, bounds.width - 2),
    height: Math.max(0, bounds.height - 2)
  };
  const lines = tooltipContentLines(widget).slice(0, contentBounds.height);
  for (let index = 0; index < lines.length; index += 1) {
    const line = clipTextCells(lines[index] ?? '', contentBounds.width, { widthProfile: buffer.widthProfile }).text;
    buffer.write(contentBounds.row + index, contentBounds.column, [{
      text: line,
      style: tooltipTextStyle(tone),
      source: tooltipSource(widget, 'content', `content.${String(index)}`)
    }]);
  }
}

export function tooltipPreferredSize(widget: TooltipNode, widthProfile: TextWidthProfile): TooltipSize {
  const maxWidth = tooltipMaxWidth(widget);
  const title = tooltipTitle(widget);
  const lines = tooltipContentLines(widget);
  const contentWidth = lines.reduce(
    (max, line) => Math.max(max, measureTextCells(line, { widthProfile }).cells),
    0
  );
  const titleWidth = title.length === 0 ? 0 : measureTextCells(` ${title} `, { widthProfile }).cells;
  return {
    width: Math.max(2, Math.min(maxWidth, Math.max(contentWidth, titleWidth) + 2)),
    height: Math.max(2, lines.length + 2)
  };
}

export function tooltipAccessibleBase(widget: TooltipNode, id: string, focused: boolean): AccessibleNode {
  const title = tooltipTitle(widget);
  const content = tooltipContentLines(widget).join(' ');
  return {
    id,
    role: 'text',
    label: title.length === 0 ? content || id : title,
    ...(content.length === 0 || content === title ? {} : { description: content }),
    live: 'polite',
    scope: { kind: 'popover' },
    ...(focused ? { focused } : {})
  };
}

function tooltipContentLines(widget: TooltipNode): readonly string[] {
  const content = widget.props.content;
  if (Array.isArray(content)) {
    const cleaned = content.map((line) => stringify(line)).filter((line) => line.length > 0);
    return cleaned.length === 0 ? [''] : cleaned;
  }
  const text = stringify(content);
  return text.length === 0 ? [''] : text.split('\n');
}

function tooltipTitle(widget: TooltipNode): string {
  return stringify(widget.props.title);
}

function tooltipMaxWidth(widget: TooltipNode): number {
  const value = widget.props.maxWidth;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(4, Math.floor(value))
    : 48;
}

function tooltipTone(widget: TooltipNode): TooltipTone {
  const value = widget.props.tone;
  return value === 'info'
    || value === 'success'
    || value === 'warning'
    || value === 'error'
    ? value
    : 'default';
}

function tooltipBorder(widget: TooltipNode, tone: TooltipTone): BorderStyle {
  const explicit = borderStyleFromValue(widget.props.border);
  const title = tooltipTitle(widget);
  return {
    ...(explicit ?? { kind: 'rounded' }),
    ...(title.length === 0 ? {} : { title }),
    style: tooltipBorderStyle(tone)
  };
}

function fillTooltipBackground(widget: TooltipNode, buffer: RenderTarget, bounds: Rect, style: TerminalStyle): void {
  const text = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text,
      style,
      source: tooltipSource(widget, 'background', 'background')
    }]);
  }
}

function tooltipSource(widget: TooltipNode, visual: TooltipVisualKind, label: string): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: 'drawing',
    role: visual === 'content' ? 'text' : 'decoration',
    part: label,
    partKind: visual,
    label
  });
}

function tooltipBackgroundStyle(tone: TooltipTone): TerminalStyle {
  return {
    bg: {
      kind: 'theme',
      token: tone === 'warning'
        ? 'surface.warning.background'
        : tone === 'error'
          ? 'surface.danger.background'
          : tone === 'success'
            ? 'surface.success.background'
            : tone === 'info'
              ? 'surface.selected.background'
              : 'surface.raised.background'
    }
  };
}

function tooltipBorderStyle(tone: TooltipTone): TerminalStyle {
  return {
    fg: {
      kind: 'theme',
      token: tone === 'warning'
        ? 'surface.warning.border'
        : tone === 'error'
          ? 'surface.danger.border'
          : tone === 'success'
            ? 'surface.success.border'
            : tone === 'info'
              ? 'surface.selected.border'
              : 'surface.raised.border'
    }
  };
}

function tooltipTextStyle(tone: TooltipTone): TerminalStyle {
  if (tone === 'warning') return { fg: { kind: 'theme', token: 'status.warning' } };
  if (tone === 'error') return { fg: { kind: 'theme', token: 'status.error' } };
  if (tone === 'success') return { fg: { kind: 'theme', token: 'status.success' } };
  return { fg: { kind: 'theme', token: 'text.default' } };
}

type TooltipNode = RenderNodeOfKind<unknown, 'tooltip'>;
