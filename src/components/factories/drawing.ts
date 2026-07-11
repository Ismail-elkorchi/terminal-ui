import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../element.ts';
import { assertCanvasPainter } from '../extension-validation.ts';
import type { CanvasOptions } from '../options/drawing.ts';
import { componentMetaProps } from '../factory-internals/interaction.ts';
import { optionalId } from '../factory-internals/render-node.ts';

export function canvas(options: CanvasOptions): Element {
  assertCanvasPainter(options.painter);
  return elementFromRenderNode<'canvas'>({
    ...optionalId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...componentMetaProps(options.meta)
  });
}
