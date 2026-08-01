import { renderNodeId } from '../../foundation/identity.ts';
import type { RenderNode } from '../../renderer/model/index.ts';
import { normalizeBorderTitle } from '../../visual/border.ts';

export function popupSurfaceRenderNode<TMessage>(input: {
  readonly parentElementId: string;
  readonly child: RenderNode<TMessage>;
  readonly title?: string;
}): RenderNode<TMessage> {
  return {
    id: renderNodeId(`${input.parentElementId}:popup`, 'popup surface'),
    kind: 'surface',
    props: {
      appearance: 'raised',
      border: { kind: 'rounded' },
      padding: 0,
      ...(input.title === undefined
        ? {}
        : { title: normalizeBorderTitle(input.title) })
    },
    children: [input.child],
    layer: { zIndex: 20, underlay: 'clear' },
    focus: { disabled: true }
  };
}
