import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type { CanvasOptions } from '../options/drawing.ts';
import { componentMetaProps } from '../internal/interaction.ts';
import { optionalRenderNodeId } from '../../renderer/model/element.ts';
import { assertValidMeasurement } from '../../renderer/measurement-validation.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';

export function canvas(options: CanvasOptions): Element {
  if (typeof options.painter !== 'function') {
    throw new TypeError('canvas() painter must be a function.');
  }
  assertValidMeasurement(options.measurement, `canvas()${options.id === undefined ? '' : ` "${options.id}"`}`);
  const decorative = isNonArrayObject(options.meta?.accessibility)
    && options.meta.accessibility['decorative'] === true;
  if (!decorative && (typeof options.label !== 'string' || options.label.trim() === '')) {
    throw new TypeError('canvas() requires a non-empty accessible label.');
  }
  if (decorative && options.label !== undefined) {
    throw new TypeError('Decorative canvas() must omit its accessible label.');
  }
  return componentElementFromRenderNode<'canvas'>({
    ...optionalRenderNodeId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      measurement: options.measurement,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...componentMetaProps(options.meta)
  });
}
