import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import type { Rect } from './layout.ts';
import type { TerminalStyle } from './render-primitives.ts';
import { mergeStyles, resolveWidgetStyle } from './widget-style.ts';
import { stringify } from './widget-props.ts';
import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';

export type SurfaceVariant =
  | 'neutral'
  | 'raised'
  | 'inset'
  | 'selected'
  | 'warning'
  | 'danger'
  | 'success';

export interface SurfaceChromeOptions {
  readonly variant?: SurfaceVariant;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
}

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
  const border = surfaceBorder(widget, variant);
  drawSurfaceFrame(buffer, bounds, widget, theme, focused, {
    ...(variant === undefined ? {} : { variant }),
    ...(border === undefined ? {} : { border }),
    ...(widget.props['shadow'] === true ? { shadow: true } : {})
  });
}

export function drawSurfaceFrame(
  buffer: FrameBuffer,
  bounds: Rect,
  widget: Widget,
  theme: TerminalTheme,
  focused: boolean,
  options: SurfaceChromeOptions
): void {
  const border = surfaceFocusedBorder(options.border, focused);
  if (options.variant !== undefined) fillSurfaceBackground(buffer, bounds, surfaceBackgroundStyle(widget, options.variant));
  if (options.shadow === true) drawSurfaceShadow(buffer, bounds);
  if (border !== undefined) drawBorder(buffer, bounds, border, theme);
}

function surfaceVariantFromValue(value: unknown): SurfaceVariant | undefined {
  return value === 'neutral'
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
  if (explicit !== undefined) return surfaceBorderStyle(widget, surfaceTitledBorder(widget, explicit), variant);
  if (variant === undefined || variant === 'neutral') return undefined;
  return surfaceBorderStyle(widget, surfaceTitledBorder(widget, { kind: 'single' }), variant);
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
  const style = mergeStyles(
    resolveWidgetStyle(widget, {
      slot: 'border',
      ...(surfaceDisabled(widget) ? { state: 'disabled' } : {}),
      ...(variantStyle === undefined ? {} : { base: variantStyle })
    }),
    border.style
  );
  return style === undefined ? border : { ...border, style };
}

export function surfaceBackgroundStyle(widget: Widget, variant: SurfaceVariant): TerminalStyle {
  const base = { bg: { kind: 'theme', token: surfaceBackgroundToken(variant) } } satisfies TerminalStyle;
  return resolveWidgetStyle(widget, {
    slot: 'root',
    base,
    ...(surfaceDisabled(widget) ? { state: 'disabled' } : {})
  }) ?? base;
}

function surfaceTitledBorder(widget: Widget, border: BorderStyle): BorderStyle {
  if (border.kind === 'none' || border.title !== undefined) return border;
  const label = stringify(widget.props['label']);
  return label.length === 0 ? border : { ...border, title: label };
}

function surfaceDisabled(widget: Widget): boolean {
  return widget.props['disabled'] === true;
}

function surfaceBorderTokenStyle(variant: SurfaceVariant): TerminalStyle {
  return {
    fg: { kind: 'theme', token: surfaceBorderToken(variant) }
  };
}

export function fillSurfaceBackground(buffer: FrameBuffer, bounds: Rect, style: TerminalStyle): void {
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

export function drawSurfaceShadow(buffer: FrameBuffer, bounds: Rect): void {
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
    case 'neutral':
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
    case 'neutral':
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
