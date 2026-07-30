import type { RenderNodeKind, RenderNodeOfKind } from './types.ts';

export function renderNodeInteractionDisabled<TMessage, TKind extends RenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>
): boolean {
  if (Reflect.get(renderNode.props, 'disabled') === true) return true;
  return renderNode.kind === 'button' && Reflect.get(renderNode.props, 'state') === 'pending';
}

export function renderNodeFocusDisabled<TMessage, TKind extends RenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>,
  targetDisabled = false
): boolean {
  return targetDisabled
    || renderNode.focus?.disabled === true
    || renderNodeInteractionDisabled(renderNode);
}
