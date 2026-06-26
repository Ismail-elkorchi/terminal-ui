import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { findWidgetFocusTarget, resolveFocusPath } from './focus.ts';
import { compareCells } from './frame.ts';
import { layoutWidget } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { renderWidgetBehavior, widgetCursor } from './widget-behavior.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameCell } from './frame.ts';
import type { LayoutNode } from './layout.ts';

export { diffFrames, renderDiff, renderFrame } from './frame.ts';
export type {
  CursorPosition,
  Frame,
  FrameCell,
  FocusPath,
  RenderDiff,
  RenderFrameOptions,
  RenderOperation
} from './frame.ts';

export interface RenderWidgetFrameOptions {
  readonly focusPath?: FocusPath;
}

export function renderWidgetFrame(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): Frame {
  const layout = layoutWidget(widget, viewport);
  const cells: FrameCell[] = [];
  renderWidget(widget, layout, cells);
  const resolvedFocusPath = resolveFocusPath(layout, options.focusPath);
  const cursor = cursorForFocusedWidget(widget, layout, resolvedFocusPath);
  const accessibility = toAccessibleSnapshot({
    source: 'tui',
    root: accessibleNode(widget, layout, [], resolvedFocusPath),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  return {
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: viewport.columns,
    height: viewport.rows,
    cells: cells.sort(compareCells),
    accessibility,
    ...(cursor === undefined ? {} : { cursor }),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  };
}

function renderWidget(widget: Widget, node: LayoutNode, cells: FrameCell[]): void {
  const result = renderWidgetBehavior(widget, node, {
    cells,
    renderChildren(target = cells) {
      renderWidgetChildren(widget, node, target);
    }
  });
  if (result !== 'skipChildren') {
    renderWidgetChildren(widget, node, cells);
  }
}

function renderWidgetChildren(widget: Widget, node: LayoutNode, cells: FrameCell[]): void {
  const children = widget.children ?? [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const childNode = node.children[index];
    if (child !== undefined && childNode !== undefined) renderWidget(child, childNode, cells);
  }
}

function cursorForFocusedWidget(
  widget: Widget,
  layout: LayoutNode,
  focusPath: FocusPath | undefined
): { readonly row: number; readonly column: number } | undefined {
  const target = findWidgetFocusTarget(widget, layout, focusPath);
  if (target === undefined) return undefined;
  return widgetCursor(target.widget, target) ?? { row: target.bounds.row, column: target.bounds.column };
}
