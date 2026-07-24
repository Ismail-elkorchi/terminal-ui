import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle, BorderTitle } from './border.ts';
import type { SurfaceAppearance, SurfaceCondition } from '../../visual/surface.ts';
import type { RenderTarget } from '../model/render-target.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../model/layout.ts';
import type { FrameCellSource, TerminalStyle } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle } from './render-node-style.ts';
import { stringify } from './render-node-props.ts';
import type { TerminalTheme, ThemeColorToken } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { RenderFocusRelation } from '../model/renderer.ts';
import { renderBorderTitle } from './border-title.ts';
import { oneCellGlyph } from '../../text/index.ts';

export type { SurfaceAppearance, SurfaceCondition } from '../../visual/surface.ts';

export interface SurfaceChromeOptions {
  readonly appearance?: SurfaceAppearance;
  readonly condition?: SurfaceCondition;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
}

type SurfaceNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'surface'>;
type DialogNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'dialog'>;
type SurfaceFrameNode<TMessage = unknown> = DialogNode<TMessage> | SurfaceNode<TMessage>;

export function surfaceChildContentBounds(renderNode: SurfaceNode, bounds: Rect): Rect {
  const border = surfaceBorderForBounds(renderNode, bounds);
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
  buffer: RenderTarget,
  bounds: Rect,
  renderNode: SurfaceNode,
  theme: TerminalTheme,
  focus: RenderFocusRelation
): void {
  const focused = focus === 'self' || (focus === 'descendant' && renderNode.props.focusWithin === true);
  const appearance = surfaceAppearanceFromValue(renderNode.props.appearance);
  const condition = surfaceConditionFromValue(renderNode.props.condition);
  const border = surfaceBorderForBounds(renderNode, bounds, appearance, condition, theme);
  drawSurfaceFrame(buffer, bounds, renderNode, theme, focused, {
    ...(appearance === undefined ? {} : { appearance }),
    ...(condition === undefined ? {} : { condition }),
    ...(border === undefined ? {} : { border }),
    ...(renderNode.props.shadow === true ? { shadow: true } : {}),
    ...(renderNode.props.disabled === true ? { disabled: true } : {})
  });
}

export function drawSurfaceFrame(
  buffer: RenderTarget,
  bounds: Rect,
  renderNode: SurfaceFrameNode,
  theme: TerminalTheme,
  focused: boolean,
  options: SurfaceChromeOptions
): void {
  const border = surfaceFocusedBorder(surfaceBorderWithinBounds(options.border, bounds), focused);
  if (options.appearance !== undefined) {
    fillSurfaceBackground(
      buffer,
      bounds,
      surfaceBackgroundStyle(renderNode, options.appearance, focused, border, options),
      renderNodeFrameSource(renderNode, {
        family: 'surface',
        role: 'decoration',
        part: 'background',
        label: 'background'
      })
    );
  }
  if (options.shadow === true) {
    drawSurfaceShadow(buffer, bounds, renderNodeFrameSource(renderNode, {
      family: 'surface',
      role: 'decoration',
      part: 'shadow',
      label: 'shadow'
    }));
  }
  if (border !== undefined) drawBorder(buffer, bounds, border, theme);
}

function surfaceAppearanceFromValue(value: unknown): SurfaceAppearance | undefined {
  return value === 'neutral'
    || value === 'chrome'
    || value === 'raised'
    || value === 'inset'
    ? value
    : undefined;
}

function surfaceConditionFromValue(value: unknown): SurfaceCondition | undefined {
  return value === 'active'
    || value === 'selected'
    || value === 'warning'
    || value === 'error'
    || value === 'success'
    ? value
    : undefined;
}

function surfaceBorder(
  renderNode: SurfaceNode,
  appearance = surfaceAppearanceFromValue(renderNode.props.appearance),
  condition = surfaceConditionFromValue(renderNode.props.condition),
  theme?: TerminalTheme
): BorderStyle | undefined {
  const explicit = borderStyleFromValue(renderNode.props.border);
  if (explicit !== undefined) {
    return surfaceBorderStyle(renderNode, surfaceTitledBorder(renderNode, explicit, theme), appearance, condition);
  }
  if (appearance === undefined || appearance === 'neutral' || appearance === 'chrome') return undefined;
  return surfaceBorderStyle(
    renderNode,
    surfaceTitledBorder(renderNode, { kind: 'single' }, theme),
    appearance,
    condition
  );
}

function surfaceBorderForBounds(
  renderNode: SurfaceNode,
  bounds: Rect,
  appearance = surfaceAppearanceFromValue(renderNode.props.appearance),
  condition = surfaceConditionFromValue(renderNode.props.condition),
  theme?: TerminalTheme
): BorderStyle | undefined {
  return surfaceBorderWithinBounds(surfaceBorder(renderNode, appearance, condition, theme), bounds);
}

function surfaceBorderWithinBounds(border: BorderStyle | undefined, bounds: Rect): BorderStyle | undefined {
  if (border === undefined || border.kind === 'none') return border;
  return bounds.width >= 3 && bounds.height >= 3 ? border : undefined;
}

function surfaceFocusedBorder(border: BorderStyle | undefined, focused: boolean): BorderStyle | undefined {
  if (border === undefined || !focused || border.kind === 'none') return border;
  const focusStyle = border.focusStyle;
  return {
    ...border,
    style: {
      ...(focusStyle ?? { fg: { kind: 'theme', token: 'focus.border' } }),
      ...border.style,
      ...(focusStyle ?? {})
    }
  };
}

function surfaceBorderStyle(
  renderNode: SurfaceNode,
  border: BorderStyle,
  appearance: SurfaceAppearance | undefined,
  condition: SurfaceCondition | undefined
): BorderStyle {
  if (border.kind === 'none') return border;
  const appearanceStyle = appearance === undefined ? undefined : surfaceBorderTokenStyle(appearance);
  const conditionStyle = surfaceDisabled(renderNode) ? undefined : surfaceConditionBorderStyle(condition);
  const style = mergeStyles(
    resolveRenderNodeStyle(renderNode, {
      part: 'border',
      ...(surfaceDisabled(renderNode) ? { state: 'disabled' } : {}),
      ...(appearanceStyle === undefined ? {} : { base: appearanceStyle })
    }),
    conditionStyle,
    border.style
  );
  return style === undefined ? border : { ...border, style };
}

export function surfaceBackgroundStyle(
  renderNode: SurfaceFrameNode,
  appearance: SurfaceAppearance,
  focused = false,
  border?: BorderStyle,
  state: Pick<SurfaceChromeOptions, 'disabled' | 'condition'> = {}
): TerminalStyle {
  const condition = state.disabled === true ? undefined : state.condition;
  const base = {
    bg: {
      kind: 'theme',
      token: surfaceConditionBackgroundToken(condition) ?? surfaceBackgroundToken(appearance)
    }
  } satisfies TerminalStyle;
  const focusedBase: TerminalStyle = focused && state.disabled !== true && (border === undefined || border.kind === 'none')
    ? { ...base, bg: { kind: 'theme' as const, token: 'focus.background' } }
    : base;
  const interactionState = state.disabled === true
    ? 'disabled'
    : focused
      ? 'focused'
      : undefined;
  const conditionStyle = surfaceConditionStyle(condition);
  const styledBase = mergeStyles(focusedBase, conditionStyle) ?? focusedBase;
  return resolveRenderNodeStyle(renderNode, {
    part: 'root',
    base: styledBase,
    ...(interactionState === undefined ? {} : { state: interactionState })
  }) ?? focusedBase;
}

function surfaceConditionStyle(
  condition: SurfaceChromeOptions['condition']
): TerminalStyle | undefined {
  switch (condition) {
    case 'error':
      return themeStyle('status.error', { bold: true });
    case 'warning':
      return themeStyle('status.warning');
    case 'success':
      return themeStyle('status.success', { bold: true });
    case 'active':
      return { bold: true };
    case 'selected':
    case undefined:
      return undefined;
  }
}

function surfaceTitledBorder(renderNode: SurfaceNode, border: BorderStyle, theme: TerminalTheme | undefined): BorderStyle {
  if (border.kind === 'none' || border.title !== undefined || theme === undefined) return border;
  const title = surfaceTitle(renderNode, theme);
  return title === undefined ? border : { ...border, title };
}

function surfaceTitle(renderNode: SurfaceNode, theme: TerminalTheme): BorderTitle | undefined {
  const title = renderNode.props.title ?? stringify(renderNode.props.label);
  return renderBorderTitle(title, {
    theme,
    ...surfaceTitleStyleOption(surfaceTitleStyle(renderNode)),
    source: (part, index) => renderNodeFrameSource(renderNode, {
      family: 'surface',
      role: 'text',
      part: `${part}.${String(index)}`,
      partKind: 'title',
      label: `${part}.${String(index)}`
    })
  });
}

function surfaceTitleStyleOption(style: TerminalStyle | undefined): { readonly baseStyle?: TerminalStyle } {
  return style === undefined ? {} : { baseStyle: style };
}

function surfaceTitleStyle(renderNode: SurfaceNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(renderNode, {
    part: 'title',
    base: { fg: { kind: 'theme', token: 'surface.title' }, bold: true }
  });
}

function surfaceDisabled(renderNode: SurfaceNode): boolean {
  return renderNode.props.disabled === true;
}

function surfaceBorderTokenStyle(appearance: SurfaceAppearance): TerminalStyle {
  return {
    fg: { kind: 'theme', token: surfaceBorderToken(appearance) }
  };
}

export function fillSurfaceBackground(
  buffer: RenderTarget,
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
  buffer: RenderTarget,
  bounds: Rect,
  source: FrameCellSource
): void {
  if (bounds.width <= 3 || bounds.height <= 3) return;
  const style: TerminalStyle = { fg: { kind: 'theme', token: 'surface.shadow' }, dim: true };
  const glyph = oneCellGlyph('░', '.', { widthProfile: buffer.widthProfile });
  const rightColumn = bounds.column + bounds.width - 2;
  const bottomRow = bounds.row + bounds.height - 2;
  for (let row = bounds.row + 1; row <= bottomRow; row += 1) {
    buffer.write(row, rightColumn, [{
      text: glyph,
      style,
      source
    }]);
  }
  buffer.write(bottomRow, bounds.column + 1, [{
    text: glyph.repeat(Math.max(0, bounds.width - 2)),
    style,
    source
  }]);
}

function surfaceBackgroundToken(appearance: SurfaceAppearance): ThemeColorToken {
  switch (appearance) {
    case 'neutral':
      return 'surface.background';
    case 'chrome':
      return 'surface.chrome.background';
    case 'raised':
      return 'surface.raised.background';
    case 'inset':
      return 'surface.inset.background';
  }
}

function surfaceBorderToken(appearance: SurfaceAppearance): ThemeColorToken {
  switch (appearance) {
    case 'neutral':
      return 'surface.border';
    case 'chrome':
      return 'surface.chrome.border';
    case 'raised':
      return 'surface.raised.border';
    case 'inset':
      return 'surface.inset.border';
  }
}

function surfaceConditionBackgroundToken(
  condition: SurfaceCondition | undefined
): ThemeColorToken | undefined {
  switch (condition) {
    case 'selected':
      return 'surface.selected.background';
    case 'warning':
      return 'surface.warning.background';
    case 'error':
      return 'surface.danger.background';
    case 'success':
      return 'surface.success.background';
    case 'active':
    case undefined:
      return undefined;
  }
}

function surfaceConditionBorderStyle(
  condition: SurfaceCondition | undefined
): TerminalStyle | undefined {
  const token = (() => {
    switch (condition) {
      case 'selected':
        return 'surface.selected.border';
      case 'warning':
        return 'surface.warning.border';
      case 'error':
        return 'surface.danger.border';
      case 'success':
        return 'surface.success.border';
      case 'active':
      case undefined:
        return undefined;
    }
  })();
  return token === undefined ? undefined : { fg: { kind: 'theme', token } };
}
