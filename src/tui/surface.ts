import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle, BorderTitle, BorderTitleContent, BorderTitleRail } from './border.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import { renderNodeFrameSource } from './frame-source.ts';
import type { Rect } from './layout.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from './render-primitives.ts';
import { mergeStyles, resolveRenderNodeStyle } from './render-node-style.ts';
import { stringify } from './render-node-props.ts';
import type { TerminalTheme, ThemeColorToken } from '../theme/index.ts';
import type { RenderNodeOfKind } from '../render-node/index.ts';

export type SurfaceVariant =
  | 'neutral'
  | 'chrome'
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
  readonly disabled?: boolean;
  readonly visualState?: 'active' | 'selected' | 'error' | 'warning' | 'success';
}

type SurfaceNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'surface'>;
type ModalNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'modal'>;
type SurfaceFrameNode<TMessage = unknown> = SurfaceNode<TMessage> | ModalNode<TMessage>;

export function surfaceChildContentBounds(widget: SurfaceNode, bounds: Rect): Rect {
  const border = surfaceBorderForBounds(widget, bounds);
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
  widget: SurfaceNode,
  theme: TerminalTheme,
  focused: boolean
): void {
  const variant = surfaceVariantFromValue(widget.props.variant);
  const border = surfaceBorderForBounds(widget, bounds, variant);
  drawSurfaceFrame(buffer, bounds, widget, theme, focused, {
    ...(variant === undefined ? {} : { variant }),
    ...(border === undefined ? {} : { border }),
    ...(widget.props.shadow === true ? { shadow: true } : {}),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(widget.props.visualState === undefined ? {} : { visualState: widget.props.visualState })
  });
}

export function drawSurfaceFrame(
  buffer: FrameBuffer,
  bounds: Rect,
  widget: SurfaceFrameNode,
  theme: TerminalTheme,
  focused: boolean,
  options: SurfaceChromeOptions
): void {
  const border = surfaceFocusedBorder(surfaceBorderWithinBounds(options.border, bounds), focused);
  if (options.variant !== undefined) {
    fillSurfaceBackground(
      buffer,
      bounds,
      surfaceBackgroundStyle(widget, options.variant, focused, border, options),
      renderNodeFrameSource(widget, {
        family: 'surface',
        role: 'decoration',
        part: 'background',
        label: 'background'
      })
    );
  }
  if (options.shadow === true) {
    drawSurfaceShadow(buffer, bounds, renderNodeFrameSource(widget, {
      family: 'surface',
      role: 'decoration',
      part: 'shadow',
      label: 'shadow'
    }));
  }
  if (border !== undefined) drawBorder(buffer, bounds, border, theme);
}

function surfaceVariantFromValue(value: unknown): SurfaceVariant | undefined {
  return value === 'neutral'
    || value === 'chrome'
    || value === 'raised'
    || value === 'inset'
    || value === 'selected'
    || value === 'warning'
    || value === 'danger'
    || value === 'success'
    ? value
    : undefined;
}

function surfaceBorder(widget: SurfaceNode, variant = surfaceVariantFromValue(widget.props.variant)): BorderStyle | undefined {
  const explicit = borderStyleFromValue(widget.props.border);
  if (explicit !== undefined) return surfaceBorderStyle(widget, surfaceTitledBorder(widget, explicit), variant);
  if (variant === undefined || variant === 'neutral' || variant === 'chrome') return undefined;
  return surfaceBorderStyle(widget, surfaceTitledBorder(widget, { kind: 'single' }), variant);
}

function surfaceBorderForBounds(
  widget: SurfaceNode,
  bounds: Rect,
  variant = surfaceVariantFromValue(widget.props.variant)
): BorderStyle | undefined {
  return surfaceBorderWithinBounds(surfaceBorder(widget, variant), bounds);
}

function surfaceBorderWithinBounds(border: BorderStyle | undefined, bounds: Rect): BorderStyle | undefined {
  if (border === undefined || border.kind === 'none') return border;
  return bounds.width >= 3 && bounds.height >= 3 ? border : undefined;
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

function surfaceBorderStyle(widget: SurfaceNode, border: BorderStyle, variant: SurfaceVariant | undefined): BorderStyle {
  if (border.kind === 'none') return border;
  const variantStyle = variant === undefined ? undefined : surfaceBorderTokenStyle(variant);
  const style = mergeStyles(
    resolveRenderNodeStyle(widget, {
      part: 'border',
      ...(surfaceDisabled(widget) ? { state: 'disabled' } : {}),
      ...(variantStyle === undefined ? {} : { base: variantStyle })
    }),
    border.style
  );
  return style === undefined ? border : { ...border, style };
}

export function surfaceBackgroundStyle(
  widget: SurfaceFrameNode,
  variant: SurfaceVariant,
  focused = false,
  border?: BorderStyle,
  state: Pick<SurfaceChromeOptions, 'disabled' | 'visualState'> = {}
): TerminalStyle {
  const base = { bg: { kind: 'theme', token: surfaceBackgroundToken(variant) } } satisfies TerminalStyle;
  const focusedBase = focused && state.disabled !== true && (border === undefined || border.kind === 'none')
    ? { ...base, bg: { kind: 'theme' as const, token: 'focus.background' } }
    : base;
  const visualState = state.disabled === true
    ? 'disabled'
    : focused
      ? 'focused'
      : state.visualState;
  return resolveRenderNodeStyle(widget, {
    part: 'root',
    base: focusedBase,
    ...(visualState === undefined ? {} : { state: visualState })
  }) ?? focusedBase;
}

function surfaceTitledBorder(widget: SurfaceNode, border: BorderStyle): BorderStyle {
  if (border.kind === 'none' || border.title !== undefined) return border;
  const title = surfaceTitle(widget);
  return title === undefined ? border : { ...border, title };
}

function surfaceTitle(widget: SurfaceNode): BorderTitle | undefined {
  const explicit = widget.props.title;
  if (isBorderTitleRailInput(explicit)) {
    const rail = {
      ...surfaceRailTitlePart(widget, 'start', explicit),
      ...surfaceRailTitlePart(widget, 'center', explicit),
      ...surfaceRailTitlePart(widget, 'end', explicit)
    };
    return Object.keys(rail).length === 0 ? undefined : rail;
  }
  return surfaceTitleContent(widget, explicit, 'title') ?? surfaceTitleContent(widget, stringify(widget.props.label), 'title');
}

function surfaceRailTitlePart<TKey extends keyof BorderTitleRail>(
  widget: SurfaceNode,
  key: TKey,
  input: Record<string, unknown>
): Pick<BorderTitleRail, TKey> | Record<string, never> {
  const title = surfaceTitleContent(widget, input[key], `title.${key}`);
  return title === undefined ? {} : { [key]: title } as Pick<BorderTitleRail, TKey>;
}

function surfaceTitleContent(widget: SurfaceNode, value: unknown, label: string): BorderTitleContent | undefined {
  if (Array.isArray(value)) {
    const spans = value.flatMap((currentSpan, index): readonly RenderSpan[] =>
      isRenderSpan(currentSpan) ? [surfaceTitleSpan(widget, currentSpan, `${label}.${String(index)}`)] : []
    );
    return spans.length === 0 ? undefined : spans;
  }
  const title = sanitizeTerminalText(typeof value === 'string' ? value : '').text;
  return title.length === 0
    ? undefined
    : [surfaceTitleSpan(widget, { text: title }, `${label}.0`)];
}

function surfaceTitleSpan(widget: SurfaceNode, currentSpan: Pick<RenderSpan, 'text'> & Partial<RenderSpan>, label: string): RenderSpan {
  const text = sanitizeTerminalText(currentSpan.text).text;
  const style = currentSpan.style ?? surfaceTitleStyle(widget);
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
    source: currentSpan.source ?? renderNodeFrameSource(widget, {
      family: 'surface',
      role: 'text',
      part: label,
      partKind: 'title',
      label
    })
  };
}

function isBorderTitleRailInput(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && ('start' in value || 'center' in value || 'end' in value);
}

function surfaceTitleStyle(widget: SurfaceNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    part: 'title',
    base: { fg: { kind: 'theme', token: 'surface.title' }, bold: true }
  });
}

function isRenderSpan(value: unknown): value is RenderSpan {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly text?: unknown }).text === 'string';
}

function surfaceDisabled(widget: SurfaceNode): boolean {
  return widget.props.disabled === true;
}

function surfaceBorderTokenStyle(variant: SurfaceVariant): TerminalStyle {
  return {
    fg: { kind: 'theme', token: surfaceBorderToken(variant) }
  };
}

export function fillSurfaceBackground(
  buffer: FrameBuffer,
  bounds: Rect,
  style: TerminalStyle,
  source: FrameCellSource
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const text = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text,
      style,
      source
    }]);
  }
}

export function drawSurfaceShadow(
  buffer: FrameBuffer,
  bounds: Rect,
  source: FrameCellSource
): void {
  if (bounds.width <= 3 || bounds.height <= 3) return;
  const style: TerminalStyle = { fg: { kind: 'theme', token: 'surface.shadow' }, dim: true };
  const rightColumn = bounds.column + bounds.width - 2;
  const bottomRow = bounds.row + bounds.height - 2;
  for (let row = bounds.row + 1; row <= bottomRow; row += 1) {
    buffer.write(row, rightColumn, [{
      text: '░',
      style,
      source
    }]);
  }
  buffer.write(bottomRow, bounds.column + 1, [{
    text: '░'.repeat(Math.max(0, bounds.width - 2)),
    style,
    source
  }]);
}

function surfaceBackgroundToken(variant: SurfaceVariant): ThemeColorToken {
  switch (variant) {
    case 'neutral':
      return 'surface.background';
    case 'chrome':
      return 'surface.chrome.background';
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

function surfaceBorderToken(variant: SurfaceVariant): ThemeColorToken {
  switch (variant) {
    case 'neutral':
      return 'surface.border';
    case 'chrome':
      return 'surface.chrome.border';
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
