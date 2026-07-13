import { elementFromRenderNode, toRenderNodes } from '../../renderer/model/element.ts';
import type { Element, ElementChildren } from '../../element/index.ts';
import type { GridAreasOptions, GridOptions } from '../options.ts';
import { componentMetaProps } from '../../authoring/metadata.ts';
import {
  layoutProps,
  optionalId,
  renderNodeChildren
} from '../../authoring/render-node.ts';
import { assertGridAreaChildren, gridAreaNames, parseGridAreas } from './internals.ts';

export function grid<TMessage>(children: ElementChildren<TMessage>, options: GridOptions): Element<TMessage>;
export function grid<TMessage>(options: GridAreasOptions<TMessage>): Element<TMessage>;
export function grid<TMessage>(
  childrenOrOptions: ElementChildren<TMessage> | GridAreasOptions<TMessage>,
  options?: GridOptions
): Element<TMessage> {
  if (options !== undefined) {
    return elementFromRenderNode<'grid', TMessage>({
      ...optionalId(options.id),
      kind: 'grid',
      props: {
        rows: options.rows,
        columns: options.columns,
        ...(options.gap === undefined ? {} : { gap: options.gap }),
        ...(options.rowGap === undefined ? {} : { rowGap: options.rowGap }),
        ...(options.columnGap === undefined ? {} : { columnGap: options.columnGap }),
        ...layoutProps(options)
      },
      children: renderNodeChildren(childrenOrOptions as ElementChildren<TMessage>),
      ...componentMetaProps(options.meta)
    });
  }

  const areaOptions = childrenOrOptions as GridAreasOptions<TMessage>;
  const template = parseGridAreas(areaOptions.areas);
  const areaNames = gridAreaNames(template);
  assertGridAreaChildren(areaNames, areaOptions.children);
  if (areaOptions.rows.length !== template.length) {
    throw new RangeError(`grid areas rows length ${String(areaOptions.rows.length)} must match template rows ${String(template.length)}.`);
  }
  if (template[0] !== undefined && areaOptions.columns.length !== template[0].length) {
    throw new RangeError(`grid areas columns length ${String(areaOptions.columns.length)} must match template columns ${String(template[0].length)}.`);
  }
  return elementFromRenderNode<'grid', TMessage>({
    ...optionalId(areaOptions.id),
    kind: 'grid',
    props: {
      areas: template,
      areaNames,
      rows: areaOptions.rows,
      columns: areaOptions.columns,
      ...(areaOptions.gap === undefined ? {} : { gap: areaOptions.gap }),
      ...(areaOptions.rowGap === undefined ? {} : { rowGap: areaOptions.rowGap }),
      ...(areaOptions.columnGap === undefined ? {} : { columnGap: areaOptions.columnGap }),
      ...layoutProps(areaOptions)
    },
    children: toRenderNodes(
      areaNames
        .map((name) => areaOptions.children[name])
        .filter((child): child is Element<TMessage> => child !== undefined)
    ),
    ...componentMetaProps(areaOptions.meta)
  });
}
