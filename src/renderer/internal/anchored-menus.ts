import { placeAnchoredSurface } from '../../interaction/anchored-surface.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { LayoutNode, Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import {
  menuBarItemBounds,
  menuPopupContentSize
} from './menu-widgets.ts';
import { renderNodeTargetId } from './pointer-presentation.ts';

type ContextMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'contextMenu'>;
type MenuBarNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'menuBar'>;
type DropdownMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'dropdownMenu'>;

export function contextMenuPopupBounds(widget: ContextMenuNode, viewport: Rect): readonly Rect[] {
  if (widget.props.presentation.kind === 'closed' || (widget.children?.length ?? 0) === 0) return [];
  return [placeAnchoredSurface({
    viewport,
    anchor: widget.props.presentation.anchor,
    size: menuPopupContentSize(
      widget.props.presentation.menu.items,
      widget.props.maxVisibleItems,
      widget.props.title
    ),
    ...(widget.props.placement === undefined ? {} : { placement: widget.props.placement }),
    margin: 0
  })];
}

export function dropdownMenuPopupBounds(widget: DropdownMenuNode, bounds: Rect, viewport: Rect): readonly Rect[] {
  if (widget.props.presentation.kind === 'closed' || (widget.children?.length ?? 0) === 0) return [];
  const contentSize = menuPopupContentSize(widget.props.presentation.menu.items, widget.props.maxVisibleItems, undefined);
  return [placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: triggerBounds(bounds) },
    size: { ...contentSize, width: Math.max(bounds.width, contentSize.width) },
    ...(widget.props.placement === undefined ? {} : { placement: widget.props.placement }),
    margin: 0
  })];
}

export function menuBarPopupBounds(widget: MenuBarNode, bounds: Rect, viewport: Rect): readonly Rect[] {
  if (widget.props.presentation.kind === 'closed' || (widget.children?.length ?? 0) === 0) return [];
  const heading = menuBarItemBounds(widget, bounds).find((candidate) => candidate.item.id === widget.props.presentation.active);
  if (heading === undefined) return [];
  return [placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: heading.bounds },
    size: menuPopupContentSize(widget.props.presentation.menu.items, widget.props.maxVisibleItems, undefined),
    placement: 'below',
    margin: 0
  })];
}

export function contextMenuHitTargets<TMessage>(widget: ContextMenuNode<TMessage>, layout: LayoutNode): readonly HitTarget<TMessage>[] {
  const toMessage = widget.props.toActionMessage;
  if (widget.props.presentation.kind === 'closed' || toMessage === undefined) return [];
  return anchoredBackdropTargets(widget, layout, () => toMessage({ kind: 'dismiss', reason: 'outsidePress' }));
}

export function dropdownMenuHitTargets<TMessage>(widget: DropdownMenuNode<TMessage>, layout: LayoutNode): readonly HitTarget<TMessage>[] {
  const toMessage = widget.props.toDropdownMenuActionMessage;
  if (toMessage === undefined) return [];
  const trigger: HitTarget<TMessage> = {
    id: renderNodeTargetId(widget, 'control'),
    bounds: triggerBounds(layout.bounds),
    accepts: ['click'],
    message: () => toMessage({ kind: 'toggle' }),
    cursor: 'pointer',
    ...(widget.props.presentation.kind === 'open' ? { zIndex: 21 } : {})
  };
  return widget.props.presentation.kind === 'closed'
    ? [trigger]
    : [
        ...anchoredBackdropTargets(widget, layout, () => toMessage({ kind: 'dismiss', reason: 'outsidePress' })),
        trigger
      ];
}

export function menuBarHitTargets<TMessage>(widget: MenuBarNode<TMessage>, layout: LayoutNode): readonly HitTarget<TMessage>[] {
  const toMessage = widget.props.toActionMessage;
  if (toMessage === undefined) return [];
  const headings = menuBarItemBounds(widget, layout.bounds).flatMap(({ item, bounds }) => item.disabled === true ? [] : [{
    id: renderNodeTargetId(widget, item.id),
    bounds,
    accepts: ['click'] as const,
    message: () => toMessage({ kind: 'activateHeading', id: item.id }),
    cursor: 'pointer' as const,
    ...(widget.props.presentation.kind === 'open' ? { zIndex: 21 } : {})
  }]);
  return widget.props.presentation.kind === 'closed'
    ? headings
    : [
        ...anchoredBackdropTargets(widget, layout, () => toMessage({ kind: 'close', reason: 'outsidePress' })),
        ...headings
      ];
}

function anchoredBackdropTargets<TMessage>(
  widget: ContextMenuNode<TMessage> | DropdownMenuNode<TMessage> | MenuBarNode<TMessage>,
  layout: LayoutNode,
  dismiss: () => TMessage
): readonly HitTarget<TMessage>[] {
  const popupBounds = layout.children[0]?.bounds;
  return [
    {
      id: renderNodeTargetId(widget, 'outside'),
      bounds: layout.viewport,
      accepts: ['click'],
      message: dismiss,
      zIndex: 18
    },
    ...(popupBounds === undefined ? [] : [{
      id: renderNodeTargetId(widget, 'popup'),
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
