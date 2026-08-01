import { layoutElementFromRenderNode, toRenderNodes } from '../../renderer/model/element.ts';
import type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage,
  ElementValue
} from '../../element/index.ts';
import type { GridAreasOptions, GridOptions } from '../options.ts';
import { renderNodeMeta as componentMetaProps } from '../../renderer/model/metadata.ts';
import {
  optionalRenderNodeId,
  renderNodeChildren
} from '../../renderer/model/element.ts';
import { renderNodeLayoutProps } from '../../renderer/model/props/shared-layout.ts';
import { assertGridAreaChildren, gridAreaNames, parseGridAreas } from './internals.ts';

export function grid<const TChildren extends ElementChildren>(
  children: TChildren,
  options: GridOptions
): Element<ElementChildrenMessage<TChildren>>;
export function grid<const TChildren extends Readonly<Record<string, ElementValue>>>(
  options: GridAreasOptions<TChildren>
): Element<ElementMessage<TChildren[keyof TChildren]>>;
export function grid(
  childrenOrOptions: ElementChildren | GridAreasOptions,
  options?: GridOptions
): Element<unknown> {
  if (options !== undefined) {
    return layoutElementFromRenderNode<'grid', unknown>({
      ...optionalRenderNodeId(options.id),
      kind: 'grid',
      props: {
        rows: options.rows,
        columns: options.columns,
        ...(options.gap === undefined ? {} : { gap: options.gap }),
        ...(options.rowGap === undefined ? {} : { rowGap: options.rowGap }),
        ...(options.columnGap === undefined ? {} : { columnGap: options.columnGap }),
        ...renderNodeLayoutProps(options)
      },
      children: renderNodeChildren(childrenOrOptions as ElementChildren),
      ...componentMetaProps(options.meta)
    });
  }

  const areaOptions = childrenOrOptions as GridAreasOptions;
  const template = parseGridAreas(areaOptions.areas);
  const areaNames = gridAreaNames(template);
  assertGridAreaChildren(areaNames, areaOptions.children);
  if (areaOptions.rows.length !== template.length) {
    throw new RangeError(`grid areas rows length ${String(areaOptions.rows.length)} must match template rows ${String(template.length)}.`);
  }
  if (template[0] !== undefined && areaOptions.columns.length !== template[0].length) {
    throw new RangeError(`grid areas columns length ${String(areaOptions.columns.length)} must match template columns ${String(template[0].length)}.`);
  }
  return layoutElementFromRenderNode<'grid', unknown>({
    ...optionalRenderNodeId(areaOptions.id),
    kind: 'grid',
    props: {
      areas: template,
      areaNames,
      rows: areaOptions.rows,
      columns: areaOptions.columns,
      ...(areaOptions.gap === undefined ? {} : { gap: areaOptions.gap }),
      ...(areaOptions.rowGap === undefined ? {} : { rowGap: areaOptions.rowGap }),
      ...(areaOptions.columnGap === undefined ? {} : { columnGap: areaOptions.columnGap }),
      ...renderNodeLayoutProps(areaOptions)
    },
    children: toRenderNodes(
      areaNames
        .map((name) => areaOptions.children[name])
        .filter((child): child is ElementValue => child !== undefined)
    ),
    ...componentMetaProps(areaOptions.meta)
  });
}
