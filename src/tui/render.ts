import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import { collectWidgetLayoutTargets, findWidgetFocusTarget, resolveFocusPath } from './focus.ts';
import { createFrameBuffer } from './frame.ts';
import { layoutWidget } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { renderWidgetRenderer, widgetCursor, widgetHitTargets } from './widget-behavior.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameBuffer, FrameHitTarget } from './frame.ts';
import type { LayoutNode } from './layout.ts';

export { createFrameBuffer, diffFrames, renderDiff, renderDiffWithOptions, renderFrame } from './frame.ts';
export type {
  CursorPosition,
  Frame,
  FrameBuffer,
  FrameCell,
  FrameCellSource,
  FocusPath,
  RenderBlock,
  RenderDiff,
  RenderFrameOptions,
  RenderLine,
  RenderOperation,
  RenderSerializeOptions,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle
} from './frame.ts';

export interface RenderWidgetFrameOptions {
  readonly focusPath?: FocusPath;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
}

export function renderWidgetFrame(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): Frame {
  const theme = themeForOptions(options.theme);
  const layout = layoutWidget(widget, viewport, theme);
  const buffer = createFrameBuffer(viewport.columns, viewport.rows);
  renderWidget(widget, layout, buffer, theme);
  const resolvedFocusPath = resolveFocusPath(layout, options.focusPath);
  const cursor = cursorForFocusedWidget(widget, layout, resolvedFocusPath, theme);
  const hitTargets = frameHitTargets(widget, layout, theme);
  const accessibility = toAccessibleSnapshot({
    source: 'tui',
    root: accessibleNode(widget, layout, [], resolvedFocusPath, theme),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  return buffer.snapshot({
    accessibility,
    ...(hitTargets.length === 0 ? {} : { hitTargets }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
}

function frameHitTargets(widget: Widget, layout: LayoutNode, theme: TerminalTheme): readonly FrameHitTarget[] {
  return collectWidgetLayoutTargets(widget, layout).flatMap((target): FrameHitTarget[] =>
    widgetHitTargets(target.widget, target, theme).map((hitTarget) => ({
      id: hitTarget.id,
      bounds: hitTarget.bounds,
      ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
      ...(hitTarget.zIndex === undefined ? {} : { zIndex: hitTarget.zIndex })
    }))
  );
}

function renderWidget(widget: Widget, node: LayoutNode, buffer: FrameBuffer, theme: TerminalTheme): void {
  if (!node.visible) return;
  renderWidgetRenderer(widget, {
    node,
    buffer,
    theme,
    renderChildren(target = buffer) {
      renderWidgetChildren(widget, node, target, theme);
    }
  });
}

function renderWidgetChildren(widget: Widget, node: LayoutNode, buffer: FrameBuffer, theme: TerminalTheme): void {
  const children = widget.children ?? [];
  const ordered = children
    .map((child, index) => ({ child, childNode: node.children[index], index }))
    .filter((item) => item.childNode !== undefined)
    .sort((left, right) => {
      const leftZIndex = left.childNode?.layer.zIndex ?? 0;
      const rightZIndex = right.childNode?.layer.zIndex ?? 0;
      return leftZIndex - rightZIndex || left.index - right.index;
    });
  for (const { child, childNode } of ordered) {
    if (childNode !== undefined) renderWidget(child, childNode, buffer, theme);
  }
}

function themeForOptions(theme: TerminalTheme | TerminalThemeDefinition | undefined): TerminalTheme {
  if (theme === undefined) return defineTheme();
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}

function cursorForFocusedWidget(
  widget: Widget,
  layout: LayoutNode,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme
): { readonly row: number; readonly column: number } | undefined {
  const target = findWidgetFocusTarget(widget, layout, focusPath);
  if (target === undefined) return undefined;
  return widgetCursor(target.widget, target, theme) ?? { row: target.bounds.row, column: target.bounds.column };
}
