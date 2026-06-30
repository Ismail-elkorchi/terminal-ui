import { clipTextCells, measureTextCells } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import type { Rect } from './layout.ts';
import type { TerminalStyle } from './render-primitives.ts';
import { stringify } from './widget-props.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TooltipPlacement, TooltipTone, Widget } from '../widgets/index.ts';

export interface TooltipSize {
  readonly width: number;
  readonly height: number;
}

export interface TooltipPlacementInput {
  readonly viewport: Rect;
  readonly target: Rect;
  readonly size: TooltipSize;
  readonly placement?: TooltipPlacement;
  readonly cursor?: { readonly row: number; readonly column: number };
  readonly margin?: number;
}

export function renderTooltip(widget: Widget, buffer: FrameBuffer, bounds: Rect, theme: TerminalTheme): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const tone = tooltipTone(widget);
  const border = tooltipBorder(widget, tone);
  fillTooltipBackground(buffer, bounds, tooltipBackgroundStyle(tone));
  drawBorder(buffer, bounds, border, theme);
  const contentBounds = {
    row: bounds.row + 1,
    column: bounds.column + 1,
    width: Math.max(0, bounds.width - 2),
    height: Math.max(0, bounds.height - 2)
  };
  const lines = tooltipContentLines(widget).slice(0, contentBounds.height);
  for (let index = 0; index < lines.length; index += 1) {
    const line = clipTextCells(lines[index] ?? '', contentBounds.width).text;
    buffer.write(contentBounds.row + index, contentBounds.column, [{
      text: line,
      style: tooltipTextStyle(tone),
      source: { kind: 'tooltip', role: 'text' }
    }]);
  }
}

export function tooltipPreferredSize(widget: Widget): TooltipSize {
  const maxWidth = tooltipMaxWidth(widget);
  const title = tooltipTitle(widget);
  const lines = tooltipContentLines(widget);
  const contentWidth = lines.reduce((max, line) => Math.max(max, measureTextCells(line).cells), 0);
  const titleWidth = title.length === 0 ? 0 : measureTextCells(` ${title} `).cells;
  return {
    width: Math.max(2, Math.min(maxWidth, Math.max(contentWidth, titleWidth) + 2)),
    height: Math.max(2, lines.length + 2)
  };
}

export function tooltipAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
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

export function placeTooltip(input: TooltipPlacementInput): Rect {
  const margin = Math.max(0, Math.floor(input.margin ?? 1));
  const placement = input.placement ?? 'auto';
  const target = placement === 'cursor' && input.cursor !== undefined
    ? { row: input.cursor.row, column: input.cursor.column, width: 1, height: 1 }
    : input.target;
  const ordered = placementOrder(placement);
  for (const candidate of ordered) {
    const rect = tooltipRectForPlacement(target, input.size, candidate, margin);
    if (rectInside(rect, input.viewport)) return rect;
  }
  return clampTooltipRect(tooltipRectForPlacement(target, input.size, ordered[0] ?? 'below', margin), input.viewport);
}

function tooltipContentLines(widget: Widget): readonly string[] {
  const content = widget.props['content'];
  if (Array.isArray(content)) {
    const cleaned = content.map((line) => stringify(line)).filter((line) => line.length > 0);
    return cleaned.length === 0 ? [''] : cleaned;
  }
  const text = stringify(content);
  return text.length === 0 ? [''] : text.split('\n');
}

function tooltipTitle(widget: Widget): string {
  return stringify(widget.props['title']);
}

function tooltipMaxWidth(widget: Widget): number {
  const value = widget.props['maxWidth'];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(4, Math.floor(value))
    : 48;
}

function tooltipTone(widget: Widget): TooltipTone {
  const value = widget.props['tone'];
  return value === 'info'
    || value === 'success'
    || value === 'warning'
    || value === 'error'
    ? value
    : 'default';
}

function tooltipBorder(widget: Widget, tone: TooltipTone): BorderStyle {
  const explicit = borderStyleFromValue(widget.props['border']);
  if (explicit !== undefined) return explicit;
  return {
    kind: 'rounded',
    ...(tooltipTitle(widget).length === 0 ? {} : { title: tooltipTitle(widget) }),
    style: tooltipBorderStyle(tone)
  };
}

function fillTooltipBackground(buffer: FrameBuffer, bounds: Rect, style: TerminalStyle): void {
  const text = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text,
      style,
      source: { kind: 'tooltip', role: 'decoration' }
    }]);
  }
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

function placementOrder(placement: TooltipPlacement): readonly Exclude<TooltipPlacement, 'auto' | 'cursor'>[] {
  if (placement === 'above') return ['above', 'below', 'right', 'left'];
  if (placement === 'below' || placement === 'cursor') return ['below', 'above', 'right', 'left'];
  if (placement === 'left') return ['left', 'right', 'below', 'above'];
  if (placement === 'right') return ['right', 'left', 'below', 'above'];
  return ['below', 'above', 'right', 'left'];
}

function tooltipRectForPlacement(
  target: Rect,
  size: TooltipSize,
  placement: Exclude<TooltipPlacement, 'auto' | 'cursor'>,
  margin: number
): Rect {
  if (placement === 'above') {
    return {
      row: target.row - size.height - margin,
      column: target.column,
      width: size.width,
      height: size.height
    };
  }
  if (placement === 'left') {
    return {
      row: target.row,
      column: target.column - size.width - margin,
      width: size.width,
      height: size.height
    };
  }
  if (placement === 'right') {
    return {
      row: target.row,
      column: target.column + target.width + margin,
      width: size.width,
      height: size.height
    };
  }
  return {
    row: target.row + target.height + margin,
    column: target.column,
    width: size.width,
    height: size.height
  };
}

function rectInside(rect: Rect, viewport: Rect): boolean {
  return rect.row >= viewport.row
    && rect.column >= viewport.column
    && rect.row + rect.height <= viewport.row + viewport.height
    && rect.column + rect.width <= viewport.column + viewport.width;
}

function clampTooltipRect(rect: Rect, viewport: Rect): Rect {
  return {
    row: Math.min(Math.max(rect.row, viewport.row), Math.max(viewport.row, viewport.row + viewport.height - rect.height)),
    column: Math.min(Math.max(rect.column, viewport.column), Math.max(viewport.column, viewport.column + viewport.width - rect.width)),
    width: Math.min(rect.width, viewport.width),
    height: Math.min(rect.height, viewport.height)
  };
}
