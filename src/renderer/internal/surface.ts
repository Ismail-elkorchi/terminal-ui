import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle, BorderTitle } from './border.ts';
import type { SurfaceAppearance } from '../../visual/surface.ts';
import type { RenderTarget } from '../model/render-target.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../model/layout.ts';
import type { FrameCellSource, TerminalStyle } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle } from './render-node-style.ts';
import type { TerminalTheme, ThemeColorToken } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import { renderBorderTitle } from './border-title.ts';
import { oneCellGlyph } from '../../text/index.ts';

export type { SurfaceAppearance } from '../../visual/surface.ts';

export interface SurfaceFrameOptions {
  readonly appearance?: SurfaceAppearance;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
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

export function drawSurface(
  buffer: RenderTarget,
  bounds: Rect,
  renderNode: SurfaceNode,
  theme: TerminalTheme
): void {
  const appearance = renderNode.props.appearance;
  const border = surfaceBorderForBounds(renderNode, bounds, appearance, theme);
  drawSurfaceFrame(buffer, bounds, renderNode, theme, false, {
    ...(appearance === undefined ? {} : { appearance }),
    ...(border === undefined ? {} : { border }),
    ...(renderNode.props.shadow === true ? { shadow: true } : {})
  });
}

export function drawSurfaceFrame(
  buffer: RenderTarget,
  bounds: Rect,
  renderNode: SurfaceFrameNode,
  theme: TerminalTheme,
  focused: boolean,
  options: SurfaceFrameOptions
): void {
  const border = surfaceFocusedBorder(surfaceBorderWithinBounds(options.border, bounds), focused);
  if (options.appearance !== undefined) {
    fillSurfaceBackground(
      buffer,
      bounds,
      surfaceBackgroundStyle(renderNode, options.appearance, focused, border),
      renderNodeFrameSource(renderNode, {
        rendererFamily: 'surface',
        cellRole: 'decoration',
        partName: 'background',
        description: 'background'
      })
    );
  }
  if (options.shadow === true) {
    drawSurfaceShadow(buffer, bounds, renderNodeFrameSource(renderNode, {
      rendererFamily: 'surface',
      cellRole: 'decoration',
      partName: 'shadow',
      description: 'shadow'
    }));
  }
  if (border !== undefined) drawBorder(buffer, bounds, border, theme);
}

function surfaceBorder(
  renderNode: SurfaceNode,
  appearance = renderNode.props.appearance,
  theme?: TerminalTheme
): BorderStyle | undefined {
  const explicit = borderStyleFromValue(renderNode.props.border);
  if (explicit !== undefined) {
    return surfaceBorderStyle(renderNode, surfaceTitledBorder(renderNode, explicit, theme), appearance);
  }
  if (appearance === undefined || appearance === 'neutral' || appearance === 'bar') return undefined;
  return surfaceBorderStyle(
    renderNode,
    surfaceTitledBorder(renderNode, { kind: 'single' }, theme),
    appearance
  );
}

function surfaceBorderForBounds(
  renderNode: SurfaceNode,
  bounds: Rect,
  appearance = renderNode.props.appearance,
  theme?: TerminalTheme
): BorderStyle | undefined {
  return surfaceBorderWithinBounds(surfaceBorder(renderNode, appearance, theme), bounds);
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
  appearance: SurfaceAppearance | undefined
): BorderStyle {
  if (border.kind === 'none') return border;
  const appearanceStyle = appearance === undefined ? undefined : surfaceBorderTokenStyle(appearance);
  const style = mergeStyles(
    resolveRenderNodeStyle(renderNode, {
      part: 'border',
      ...(appearanceStyle === undefined ? {} : { base: appearanceStyle })
    }),
    border.style
  );
  return style === undefined ? border : { ...border, style };
}

export function surfaceBackgroundStyle(
  renderNode: SurfaceFrameNode,
  appearance: SurfaceAppearance,
  focused = false,
  border?: BorderStyle
): TerminalStyle {
  const base = {
    bg: {
      kind: 'theme',
      token: surfaceBackgroundToken(appearance)
    }
  } satisfies TerminalStyle;
  const focusedBase: TerminalStyle = focused && (border === undefined || border.kind === 'none')
    ? { ...base, bg: { kind: 'theme' as const, token: 'focus.background' } }
    : base;
  const interactionState = focused ? 'focused' : undefined;
  return resolveRenderNodeStyle(renderNode, {
    part: 'root',
    base: focusedBase,
    ...(interactionState === undefined ? {} : { state: interactionState })
  }) ?? focusedBase;
}

function surfaceTitledBorder(renderNode: SurfaceNode, border: BorderStyle, theme: TerminalTheme | undefined): BorderStyle {
  if (border.kind === 'none' || border.title !== undefined || theme === undefined) return border;
  const title = surfaceTitle(renderNode, theme);
  return title === undefined ? border : { ...border, title };
}

function surfaceTitle(renderNode: SurfaceNode, theme: TerminalTheme): BorderTitle | undefined {
  const title = renderNode.props.title;
  return renderBorderTitle(title, {
    theme,
    ...surfaceTitleStyleOption(surfaceTitleStyle(renderNode)),
    source: (part, index) => renderNodeFrameSource(renderNode, {
      rendererFamily: 'surface',
      cellRole: 'text',
      partName: `${part}.${String(index)}`,
      partType: 'title',
      description: `${part}.${String(index)}`
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
    case 'bar':
      return 'surface.bar.background';
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
    case 'bar':
      return 'surface.bar.border';
    case 'raised':
      return 'surface.raised.border';
    case 'inset':
      return 'surface.inset.border';
  }
}
