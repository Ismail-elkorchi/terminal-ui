import type { RenderNode } from '../model/index.ts';

export function renderNodeInteractionDisabled(renderNode: RenderNode): boolean {
  if (renderNode.kind === 'button') return renderNode.props.disabled === true || renderNode.props.state === 'pending';
  return Reflect.get(renderNode.props, 'disabled') === true;
}
