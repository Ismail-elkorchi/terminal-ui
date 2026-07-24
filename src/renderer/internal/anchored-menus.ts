import { placeAnchoredSurface } from '../../interaction/anchored-surface.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { LayoutNode, Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import {
  menuBarItemBounds,
  menuPopupContentSize
} from './menu-rendering.ts';
import { renderNodeTargetId } from './pointer-presentation.ts';
import type { TextWidthProfile } from '../../text/index.ts';

type ContextMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'contextMenu'>;
type MenuBarNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'menuBar'>;
type DropdownMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'dropdownMenu'>;

export function contextMenuPopupBounds(renderNode: ContextMenuNode, viewport: Rect, widthProfile: TextWidthProfile): readonly Rect[] {
  if (renderNode.props.presentation.kind === 'closed' || (renderNode.children?.length ?? 0) === 0) return [];
  return [placeAnchoredSurface({
    viewport,
    anchor: renderNode.props.presentation.anchor,
    size: menuPopupContentSize(
      renderNode.props.presentation.menu.items,
      renderNode.props.maxVisibleItems,
      renderNode.props.title,
      widthProfile
    ),
    ...(renderNode.props.placement === undefined ? {} : { placement: renderNode.props.placement }),
    margin: 0
  })];
}

export function dropdownMenuPopupBounds(
  renderNode: DropdownMenuNode,
  bounds: Rect,
  viewport: Rect,
  widthProfile: TextWidthProfile
): readonly Rect[] {
  if (renderNode.props.presentation.kind === 'closed' || (renderNode.children?.length ?? 0) === 0) return [];
  const contentSize = menuPopupContentSize(
    renderNode.props.presentation.menu.items,
    renderNode.props.maxVisibleItems,
    undefined,
    widthProfile
  );
  return [placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: triggerBounds(bounds) },
    size: { ...contentSize, width: Math.max(bounds.width, contentSize.width) },
    ...(renderNode.props.placement === undefined ? {} : { placement: renderNode.props.placement }),
    margin: 0
  })];
}

export function menuBarPopupBounds(
  renderNode: MenuBarNode,
  bounds: Rect,
  viewport: Rect,
  widthProfile: TextWidthProfile
): readonly Rect[] {
  if (renderNode.props.presentation.kind === 'closed' || (renderNode.children?.length ?? 0) === 0) return [];
  const heading = menuBarItemBounds(renderNode, bounds, widthProfile)
    .find((candidate) => candidate.item.id === renderNode.props.presentation.active);
  if (heading === undefined) return [];
  return [placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: heading.bounds },
    size: menuPopupContentSize(renderNode.props.presentation.menu.items, renderNode.props.maxVisibleItems, undefined, widthProfile),
    placement: 'below',
    margin: 0
  })];
}

export function contextMenuHitTargets<TMessage>(renderNode: ContextMenuNode<TMessage>, layout: LayoutNode): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (renderNode.props.presentation.kind === 'closed' || toMessage === undefined) return [];
  return anchoredBackdropTargets(renderNode, layout, () => toMessage({ kind: 'dismiss', reason: 'outsidePress' }));
}

export function dropdownMenuHitTargets<TMessage>(renderNode: DropdownMenuNode<TMessage>, layout: LayoutNode): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toDropdownMenuActionMessage;
  if (toMessage === undefined) return [];
  const trigger: HitTarget<TMessage> = {
    id: renderNodeTargetId(renderNode, 'control'),
    bounds: triggerBounds(layout.bounds),
    accepts: ['click'],
    message: () => toMessage({ kind: 'toggle' }),
    cursor: 'pointer',
    ...(renderNode.props.presentation.kind === 'open' ? { zIndex: 21 } : {})
  };
  return renderNode.props.presentation.kind === 'closed'
    ? [trigger]
    : [
        ...anchoredBackdropTargets(renderNode, layout, () => toMessage({ kind: 'dismiss', reason: 'outsidePress' })),
        trigger
      ];
}

export function menuBarHitTargets<TMessage>(
  renderNode: MenuBarNode<TMessage>,
  layout: LayoutNode,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  const headings = menuBarItemBounds(renderNode, layout.bounds, widthProfile).flatMap(({ item, bounds }) => item.disabled === true ? [] : [{
    id: renderNodeTargetId(renderNode, item.id),
    bounds,
    accepts: ['click'] as const,
    message: () => toMessage({ kind: 'activateHeading', id: item.id }),
    cursor: 'pointer' as const,
    ...(renderNode.props.presentation.kind === 'open' ? { zIndex: 21 } : {})
  }]);
  return renderNode.props.presentation.kind === 'closed'
    ? headings
    : [
        ...anchoredBackdropTargets(renderNode, layout, () => toMessage({ kind: 'close', reason: 'outsidePress' })),
        ...headings
      ];
}

function anchoredBackdropTargets<TMessage>(
  renderNode: ContextMenuNode<TMessage> | DropdownMenuNode<TMessage> | MenuBarNode<TMessage>,
  layout: LayoutNode,
  dismiss: () => TMessage
): readonly HitTarget<TMessage>[] {
  const popupBounds = layout.children[0]?.bounds;
  return [
    {
      id: renderNodeTargetId(renderNode, 'outside'),
      bounds: layout.viewport,
      accepts: ['click'],
      message: dismiss,
      zIndex: 18
    },
    ...(popupBounds === undefined ? [] : [{
      id: renderNodeTargetId(renderNode, 'popup'),
      bounds: popupBounds,
      accepts: ['click'] as const,
      message: ignoreMessage,
      zIndex: 19
    }])
  ];
}

function triggerBounds(bounds: Rect): Rect {
  return { row: bounds.row, column: bounds.column, width: bounds.width, height: Math.min(1, bounds.height) };
}
