import type { RenderNode } from '../render-node/index.ts';

export function renderNodeInteractionDisabled(widget: RenderNode): boolean {
  if (widget.kind === 'button') return widget.props.state === 'disabled' || widget.props.state === 'pending';
  return Reflect.get(widget.props, 'disabled') === true;
}
