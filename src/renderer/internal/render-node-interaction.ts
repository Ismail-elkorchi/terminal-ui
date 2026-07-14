import type { RenderNode } from '../model/index.ts';

export function renderNodeInteractionDisabled(widget: RenderNode): boolean {
  if (widget.kind === 'button') return widget.props.disabled === true || widget.props.state === 'pending';
  return Reflect.get(widget.props, 'disabled') === true;
}
