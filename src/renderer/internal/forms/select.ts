import { placeAnchoredSurface } from '../../../interaction/anchored-surface.ts';
import { terminalTextWidth } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { LayoutNode, Rect } from '../../contracts.ts';
import type { HitTarget } from '../../contracts.ts';
import { ignoreMessage } from '../../../interaction/message.ts';
import { renderNodeTargetId } from '../pointer-interaction.ts';
import { formOptions } from './support/choices.ts';

type SelectNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'select'>;

export function selectPopupBounds(
  renderNode: SelectNode,
  bounds: Rect,
  viewport: Rect,
  widthProfile: TextWidthProfile
): readonly Rect[] {
  if (renderNode.props.presentation.kind !== 'open' || (renderNode.children?.length ?? 0) === 0) return [];
  const options = formOptions(renderNode);
  const visibleRows = Math.min(Math.max(1, options.length), renderNode.props.maxVisibleOptions);
  const labelWidth = options.reduce(
    (width, option) => Math.max(width, terminalTextWidth(option.label, { widthProfile })),
    0
  );
  const size = {
    width: Math.max(bounds.width, labelWidth + 4),
    height: visibleRows + 2
  };
  return [placeAnchoredSurface({
    viewport,
    anchor: {
      kind: 'target',
      bounds: { row: bounds.row, column: bounds.column, width: bounds.width, height: 1 }
    },
    size,
    ...(renderNode.props.placement === undefined ? {} : { placement: renderNode.props.placement }),
    margin: 0
  })];
}

export function selectHitTargets<TMessage>(
  renderNode: SelectNode<TMessage>,
  layout: LayoutNode
): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  const triggerBounds = {
    row: layout.bounds.row,
    column: layout.bounds.column,
    width: layout.bounds.width,
    height: Math.min(1, layout.bounds.height)
  };
  const trigger: HitTarget<TMessage> = {
    id: renderNodeTargetId(renderNode, 'trigger'),
    bounds: triggerBounds,
    accepts: ['click'],
    message: () => toMessage({ kind: 'toggle' }),
    cursor: 'pointer',
    ...(renderNode.props.presentation.kind === 'open' ? { zIndex: 21 } : {})
  };
  if (renderNode.props.presentation.kind !== 'open') return [trigger];
  const popupBounds = layout.children[0]?.bounds;
  return [
    {
      id: renderNodeTargetId(renderNode, 'outside'),
      bounds: layout.viewport,
      accepts: ['click'],
      message: () => toMessage({ kind: 'dismiss', reason: 'outsidePress' }),
      zIndex: 18
    },
    ...(popupBounds === undefined ? [] : [{
      id: renderNodeTargetId(renderNode, 'popup'),
      bounds: popupBounds,
      accepts: ['click'] as const,
      message: ignoreMessage,
      zIndex: 19
    }]),
    trigger
  ];
}
