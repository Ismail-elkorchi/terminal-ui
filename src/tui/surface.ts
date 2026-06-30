import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import type { Rect } from './layout.ts';
import type { TerminalStyle } from './render-primitives.ts';
import { mergeStyles } from './widget-style.ts';
import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';

export type SurfaceVariant =
  | 'base'
  | 'raised'
  | 'inset'
  | 'selected'
  | 'warning'
  | 'danger'
  | 'success';

export function surfaceChildContentBounds(widget: Widget, bounds: Rect): Rect {
  const border = surfaceBorder(widget);
  return border === undefined || border.kind === 'none'
    ? bounds
    : {
        row: bounds.row + 1,
        column: bounds.column + 1,
        width: Math.max(0, bounds.width - 2),
        height: Math.max(0, bounds.height - 2)
      };
}

export function drawSurfaceChrome(
  buffer: FrameBuffer,
  bounds: Rect,
  widget: Widget,
  theme: TerminalTheme,
  focused: boolean
): void {
  const variant = surfaceVariantFromValue(widget.props['variant']);
  const border = surfaceFocusedBorder(surfaceBorder(widget, variant), focused);
  if (variant !== undefined) fillSurfaceBackground(buffer, bounds, surfaceBackgroundStyle(widget, variant));
  if (widget.props['shadow'] === true) drawSurfaceShadow(buffer, bounds);
  if (border !== undefined) drawBorder(buffer, bounds, border, theme);
}

function surfaceVariantFromValue(value: unknown): SurfaceVariant | undefined {
  return value === 'base'
    || value === 'raised'
    || value === 'inset'
    || value === 'selected'
    || value === 'warning'
    || value === 'danger'
    || value === 'success'
    ? value
    : undefined;
}

function surfaceBorder(widget: Widget, variant = surfaceVariantFromValue(widget.props['variant'])): BorderStyle | undefined {
  const explicit = borderStyleFromValue(widget.props['border']);
  if (explicit !== undefined) return surfaceBorderStyle(widget, explicit, variant);
  if (variant === undefined || variant === 'base') return undefined;
  return surfaceBorderStyle(widget, { kind: 'single' }, variant);
}

function surfaceFocusedBorder(border: BorderStyle | undefined, focused: boolean): BorderStyle | undefined {
  if (border === undefined || !focused || border.kind === 'none') return border;
  return {
    ...border,
    style: {
      ...border.style,
      ...(border.focusStyle ?? { fg: { kind: 'theme', token: 'focus.border' } })
    }
  };
}

function surfaceBorderStyle(widget: Widget, border: BorderStyle, variant: SurfaceVariant | undefined): BorderStyle {
  if (border.kind === 'none') return border;
  const variantStyle = variant === undefined ? undefined : surfaceBorderTokenStyle(variant);
  const style = mergeStyles(variantStyle, widget.styles?.border, border.style);
  return style === undefined ? border : { ...border, style };
}

function surfaceBackgroundStyle(widget: Widget, variant: SurfaceVariant): TerminalStyle {
  return mergeStyles(
    { bg: { kind: 'theme', token: surfaceBackgroundToken(variant) } },
    widget.styles?.root
  ) ?? { bg: { kind: 'theme', token: surfaceBackgroundToken(variant) } };
}

function surfaceBorderTokenStyle(variant: SurfaceVariant): TerminalStyle {
  return {
    fg: { kind: 'theme', token: surfaceBorderToken(variant) }
  };
}

function fillSurfaceBackground(buffer: FrameBuffer, bounds: Rect, style: TerminalStyle): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const text = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text,
      style,
      source: { kind: 'surface', role: 'decoration' }
    }]);
  }
}

function drawSurfaceShadow(buffer: FrameBuffer, bounds: Rect): void {
  if (bounds.width <= 3 || bounds.height <= 3) return;
  const style: TerminalStyle = { fg: { kind: 'theme', token: 'surface.shadow' }, dim: true };
  const rightColumn = bounds.column + bounds.width - 2;
  const bottomRow = bounds.row + bounds.height - 2;
  for (let row = bounds.row + 1; row <= bottomRow; row += 1) {
    buffer.write(row, rightColumn, [{
      text: '░',
      style,
      source: { kind: 'surface', role: 'decoration', label: 'shadow' }
    }]);
  }
  buffer.write(bottomRow, bounds.column + 1, [{
    text: '░'.repeat(Math.max(0, bounds.width - 2)),
    style,
    source: { kind: 'surface', role: 'decoration', label: 'shadow' }
  }]);
}

function surfaceBackgroundToken(variant: SurfaceVariant): ThemeToken {
  switch (variant) {
    case 'base':
      return 'surface.background';
    case 'raised':
      return 'surface.raised.background';
    case 'inset':
      return 'surface.inset.background';
    case 'selected':
      return 'surface.selected.background';
    case 'warning':
      return 'surface.warning.background';
    case 'danger':
      return 'surface.danger.background';
    case 'success':
      return 'surface.success.background';
  }
}

function surfaceBorderToken(variant: SurfaceVariant): ThemeToken {
  switch (variant) {
    case 'base':
      return 'surface.border';
    case 'raised':
      return 'surface.raised.border';
    case 'inset':
      return 'surface.inset.border';
    case 'selected':
      return 'surface.selected.border';
    case 'warning':
      return 'surface.warning.border';
    case 'danger':
      return 'surface.danger.border';
    case 'success':
      return 'surface.success.border';
  }
}
