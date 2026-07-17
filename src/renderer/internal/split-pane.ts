import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { SplitPaneAction } from '../../ui-model/split-pane.ts';
import type { Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import type { RenderNodeOfKind } from '../model/types.ts';
import type { RenderTarget } from '../model/render-target.ts';
import type { LayoutNode } from '../model/layout.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { mergeStyles, renderNodeStyle, themeStyle } from './render-node-style.ts';

type SplitPaneNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'splitPane'>;

export function renderSplitPaneDividers<TMessage>(
  renderNode: SplitPaneNode<TMessage>,
  layoutNode: LayoutNode,
  buffer: RenderTarget,
  theme: TerminalTheme,
  focused: boolean
): void {
  const selected = selectedDivider(renderNode, layoutNode.children.length);
  splitPaneDividerBounds(layoutNode, renderNode.props.direction).forEach((bounds, dividerIndex) => {
    const active = dividerIndex === selected;
    const style = splitPaneDividerStyle(renderNode, active, focused);
    const source = renderNodeFrameSource(renderNode, {
      family: 'layout',
      role: 'separator',
      part: active ? 'divider.active' : 'divider',
      itemIndex: dividerIndex,
      label: `divider.${String(dividerIndex)}`
    });
    if (renderNode.props.direction === 'horizontal') {
      const glyph = theme.tokens.symbols.borderSingle.vertical;
      for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
        buffer.write(row, bounds.column, [{ text: glyph, style, source }]);
      }
      return;
    }
    const glyph = theme.tokens.symbols.borderSingle.horizontal;
    buffer.write(bounds.row, bounds.column, [{ text: glyph.repeat(bounds.width), style, source }]);
  });
}

export function splitPaneHitTargets<TMessage>(
  renderNode: SplitPaneNode<TMessage>,
  layoutNode: LayoutNode
): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  const contentExtent = splitPaneContentExtent(layoutNode, renderNode.props.direction);
  return splitPaneDividerBounds(layoutNode, renderNode.props.direction).map((bounds, dividerIndex): HitTarget<TMessage> => ({
    id: `divider.${String(dividerIndex)}`,
    bounds,
    accepts: ['pointerDown', 'pointerUp', 'dragStart', 'drag', 'dragEnd'],
    cursor: 'pointer',
    message: (event) => splitPanePointerAction(event, dividerIndex, renderNode.props.direction, contentExtent, toMessage)
  }));
}

export function splitPaneAccessibleNode<TMessage>(
  renderNode: SplitPaneNode<TMessage>,
  id: string,
  focused: boolean
): AccessibleNode {
  const dividerCount = Math.max(0, (renderNode.children?.length ?? 0) - 1);
  const selected = selectedDivider(renderNode, renderNode.children?.length ?? 0);
  return {
    id,
    role: 'text',
    label: id,
    ...(renderNode.props.toActionMessage === undefined
      ? {}
      : {
          description: dividerCount === 0
            ? 'Resizable split pane with no dividers.'
            : `Resizable split pane. Divider ${String(selected + 1)} of ${String(dividerCount)} selected.`
        }),
    ...(focused ? { focused } : {})
  };
}

export function splitPaneDividerBounds(
  layoutNode: LayoutNode,
  direction: 'horizontal' | 'vertical'
): readonly Rect[] {
  return layoutNode.children.slice(0, -1).flatMap((child, index): readonly Rect[] => {
    const next = layoutNode.children[index + 1];
    if (next === undefined) return [];
    if (direction === 'horizontal') {
      const column = child.bounds.column + child.bounds.width;
      const width = Math.max(0, next.bounds.column - column);
      return width === 0 ? [] : [{
        row: layoutNode.bounds.row,
        column,
        width,
        height: layoutNode.bounds.height
      }];
    }
    const row = child.bounds.row + child.bounds.height;
    const height = Math.max(0, next.bounds.row - row);
    return height === 0 ? [] : [{
      row,
      column: layoutNode.bounds.column,
      width: layoutNode.bounds.width,
      height
    }];
  });
}

function splitPanePointerAction<TMessage>(
  event: RoutedPointerEvent,
  dividerIndex: number,
  direction: 'horizontal' | 'vertical',
  contentExtent: number,
  toMessage: (action: SplitPaneAction) => TMessage
): MessageResolution<TMessage> {
  switch (event.kind) {
    case 'pointerDown':
      return toMessage({ kind: 'beginResize', dividerIndex });
    case 'dragStart':
    case 'drag':
      return toMessage({
        kind: 'resizeFromAnchor',
        dividerIndex,
        deltaShare: pointerDelta(event, direction) / Math.max(1, contentExtent)
      });
    case 'pointerUp':
    case 'dragEnd':
      return toMessage({ kind: 'endResize', dividerIndex });
    default:
      return ignoreMessage();
  }
}

function pointerDelta(event: RoutedPointerEvent, direction: 'horizontal' | 'vertical'): number {
  return direction === 'horizontal'
    ? event.column - (event.pressColumn ?? event.column)
    : event.row - (event.pressRow ?? event.row);
}

function splitPaneContentExtent(layoutNode: LayoutNode, direction: 'horizontal' | 'vertical'): number {
  return layoutNode.children.reduce(
    (sum, child) => sum + (direction === 'horizontal' ? child.bounds.width : child.bounds.height),
    0
  );
}

function selectedDivider<TMessage>(renderNode: SplitPaneNode<TMessage>, childCount: number): number {
  return Math.min(
    Math.max(0, renderNode.props.selectedDivider ?? 0),
    Math.max(0, childCount - 2)
  );
}

function splitPaneDividerStyle<TMessage>(
  renderNode: SplitPaneNode<TMessage>,
  active: boolean,
  focused: boolean
): TerminalStyle {
  return mergeStyles(
    themeStyle(active ? 'accent.primary' : 'surface.border'),
    renderNodeStyle(renderNode, active ? 'dividerActive' : 'divider', active && focused ? 'focused' : undefined)
  ) ?? {};
}
