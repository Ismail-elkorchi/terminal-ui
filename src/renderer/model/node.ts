import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './types.ts';

export function renderNodeFactoryName(renderNode: RenderNode): string {
  return renderNode.kind === 'component'
    ? renderNode.definition.name
    : renderNode.kind;
}

export function renderNodeInteractionUnavailable<TMessage, TKind extends RenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>
): boolean {
  return renderNode.availability === 'passive'
    || renderNode.availability === 'disabled'
    || renderNode.availability === 'pending';
}

export function renderNodeFocusUnavailable<TMessage, TKind extends RenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>,
  targetDisabled = false
): boolean {
  return targetDisabled
    || renderNode.focus?.disabled === true
    || renderNodeInteractionUnavailable(renderNode);
}
