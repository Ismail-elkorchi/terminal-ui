import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import { assertCanvasPainter } from '../extension-validation.ts';
import type { CanvasOptions } from '../options/drawing.ts';
import { componentMetaProps } from '../internal/interaction.ts';
import { optionalId } from '../../authoring/render-node.ts';

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
