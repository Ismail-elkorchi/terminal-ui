import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type { CanvasOptions } from '../options/drawing.ts';
import { componentMetaProps } from '../internal/interaction.ts';
import { optionalId } from '../../authoring/render-node.ts';

export function canvas(options: CanvasOptions): Element {
  if (typeof options.painter !== 'function') {
    throw new TypeError('canvas() painter must be a function.');
  }
  return componentElementFromRenderNode<'canvas'>({
    ...optionalId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...componentMetaProps(options.meta)
  });
}
