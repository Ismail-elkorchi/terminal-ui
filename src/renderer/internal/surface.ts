import { borderStyleFromValue, drawBorder } from './border.ts';
import type { BorderStyle, BorderTitle } from './border.ts';
import type { SurfaceAppearance } from '../../visual/surface.ts';
import type { RenderTarget } from '../contracts.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../contracts.ts';
import type { FrameCellSource, TerminalStyle } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle } from '../style-resolution.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type { TerminalTheme, ThemeColorToken } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import { renderBorderTitle } from './border-title.ts';

export type { SurfaceAppearance } from '../../visual/surface.ts';

export interface SurfaceFrameOptions {
  readonly appearance?: SurfaceAppearance;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
}

type SurfaceNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'surface'>;

export function surfaceChildContentBounds(renderNode: SurfaceNode, bounds: Rect): Rect {
  const frameBounds = surfaceFrameBounds(bounds, renderNode.props.shadow === true);
  const border = surfaceBorderForBounds(renderNode, frameBounds);
  return border === undefined || border.kind === 'none'
    ? frameBounds
    : {
        row: frameBounds.row + 1,
        column: frameBounds.column + 1,
        width: Math.max(0, frameBounds.width - 2),
        height: Math.max(0, frameBounds.height - 2)
      };
}

export function drawSurface(
  buffer: RenderTarget,
  bounds: Rect,
  renderNode: SurfaceNode,
  theme: TerminalTheme
): void {
  const appearance = renderNode.props.appearance;
  const frameBounds = surfaceFrameBounds(bounds, renderNode.props.shadow === true);
  const border = surfaceBorderForBounds(renderNode, frameBounds, appearance, theme);
  drawSurfaceFrame(buffer, bounds, renderNode, theme, false, {
    ...(appearance === undefined ? {} : { appearance }),
    ...(border === undefined ? {} : { border }),
    ...(renderNode.props.shadow === true ? { shadow: true } : {})
  });
}

export function drawSurfaceFrame(
  buffer: RenderTarget,
  bounds: Rect,
  renderNode: SurfaceNode,
  theme: TerminalTheme,
  focused: boolean,
  options: SurfaceFrameOptions
): void {
  const frameBounds = surfaceFrameBounds(bounds, options.shadow === true);
  const border = surfaceFocusedBorder(surfaceBorderWithinBounds(options.border, frameBounds), focused);
  if (options.appearance !== undefined) {
    const style = surfaceBackgroundStyle(renderNode, options.appearance, focused, border);
    if (terminalStyleHasBackground(style, theme)) {
      fillSurfaceBackground(
        buffer,
        frameBounds,
        style,
        renderNodeFrameSource(renderNode, {
          rendererFamily: 'surface',
          cellRole: 'decoration',
          partName: 'background',
          description: 'background'
        })
      );
    }
  }
  if (options.shadow === true) {
    drawSurfaceShadow(
      buffer,
      bounds,
      frameBounds,
      theme,
      renderNodeFrameSource(renderNode, {
        rendererFamily: 'surface',
        cellRole: 'decoration',
        partName: 'shadow',
        description: 'shadow'
      })
    );
  }
  if (border !== undefined) drawBorder(buffer, frameBounds, border, theme);
}

function surfaceBorder(
  renderNode: SurfaceNode,
  appearance = renderNode.props.appearance,
  theme?: TerminalTheme
): BorderStyle | undefined {
  const resolved = surfaceBorderForLayout(renderNode);
  if (resolved === undefined) return undefined;
  return surfaceBorderStyle(renderNode, surfaceTitledBorder(renderNode, resolved, theme), appearance);
}

export function surfaceBorderForLayout(renderNode: SurfaceNode): BorderStyle | undefined {
  const explicit = borderStyleFromValue(renderNode.props.border);
  if (explicit !== undefined) return explicit;
  return renderNode.props.title === undefined ? undefined : { kind: 'single' };
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
  renderNode: SurfaceNode,
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
  frameBounds: Rect,
  theme: TerminalTheme,
  source: FrameCellSource
): void {
  if (frameBounds === bounds) return;
  const style: TerminalStyle = {
    fg: { kind: 'theme', token: 'surface.shadow' },
    dim: true
  };
  const glyph = theme.tokens.symbols.mode === 'unicode' ? '░' : '.';
  const rightColumn = frameBounds.column + frameBounds.width;
  const bottomRow = frameBounds.row + frameBounds.height;
  for (let row = frameBounds.row + 1; row < bottomRow; row += 1) {
    buffer.write(row, rightColumn, [{
      text: glyph,
      style,
      source
    }]);
  }
  buffer.write(bottomRow, frameBounds.column + 1, [{
    text: glyph.repeat(Math.max(0, frameBounds.width)),
    style,
    source
  }]);
}

export function surfaceFrameBounds(bounds: Rect, shadow: boolean): Rect {
  if (!shadow || bounds.width < 4 || bounds.height < 4) return bounds;
  return {
    row: bounds.row,
    column: bounds.column,
    width: bounds.width - 1,
    height: bounds.height - 1
  };
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
