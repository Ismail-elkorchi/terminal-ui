import type { RenderNode } from '../render-node/index.ts';
export function renderNodeInteractionDisabled(widget: RenderNode): boolean {
  return widget.props['disabled'] === true;
}
