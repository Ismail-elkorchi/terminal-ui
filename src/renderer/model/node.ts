import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './types.ts';
import { isIgnoredMessage } from '../../interaction/message.ts';

export function renderNodeFactoryName(renderNode: RenderNode): string {
  return renderNode.kind === 'component' ? renderNode.definition.name : renderNode.kind;
}

export function renderNodeInteractionUnavailable<TMessage, TKind extends RenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>
): boolean {
  return renderNode.state?.disabled === true || renderNode.state?.inert === true;
}

export function renderNodeFocusUnavailable<TMessage, TKind extends RenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>,
  targetDisabled = false
): boolean {
  return targetDisabled
    || renderNode.focus?.disabled === true
    || renderNodeInteractionUnavailable(renderNode);
}

export function resolveRenderNodeMessage<TMessage>(
  renderNode: RenderNode<TMessage>,
  message: unknown
): unknown {
  return isIgnoredMessage(message) || renderNode.messageMap === undefined
    ? message
    : renderNode.messageMap(message);
}
