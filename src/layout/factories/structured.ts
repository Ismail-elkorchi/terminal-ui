import type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage,
  ElementValue,
} from '../../element/types.ts';
import {
  layoutElementFromRenderNode,
  optionalRenderNodeId,
  renderNodeChildren,
  toRenderNodes,
} from '../../renderer/internal/render-tree/element.ts';
import {
  renderNodeMeta as componentMetaProps,
} from '../../renderer/internal/render-tree/metadata.ts';
import { decodeLayoutCellCount, decodeLayoutFlowOptions, decodeLayoutTracks } from '../decode-options.ts';
import type { GridAreasOptions, GridOptions } from '../options.ts';
import { assertGridAreaChildren, gridAreaNames, parseGridAreas } from './grid-areas.ts';

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
        rows: decodeLayoutTracks(options.rows, 'grid rows'),
        columns: decodeLayoutTracks(options.columns, 'grid columns'),
        ...(options.rowGap === undefined ? {} : { rowGap: decodeLayoutCellCount(options.rowGap, 'grid rowGap') }),
        ...(options.columnGap === undefined ? {} : { columnGap: decodeLayoutCellCount(options.columnGap, 'grid columnGap') }),
        ...decodeLayoutFlowOptions(options, 'grid')
      },
      children: renderNodeChildren(childrenOrOptions as ElementChildren),
      ...componentMetaProps(options)
    });
  }

  const areaOptions = childrenOrOptions as GridAreasOptions;
  const rows = decodeLayoutTracks(areaOptions.rows, 'grid rows');
  const columns = decodeLayoutTracks(areaOptions.columns, 'grid columns');
  const template = parseGridAreas(areaOptions.areas);
  const areaNames = gridAreaNames(template);
  assertGridAreaChildren(areaNames, areaOptions.children);
  if (rows.length !== template.length) {
    throw new RangeError(`grid areas rows length ${String(rows.length)} must match template rows ${String(template.length)}.`);
  }
  if (template[0] !== undefined && columns.length !== template[0].length) {
    throw new RangeError(`grid areas columns length ${String(columns.length)} must match template columns ${String(template[0].length)}.`);
  }
  return layoutElementFromRenderNode<'grid', unknown>({
    ...optionalRenderNodeId(areaOptions.id),
    kind: 'grid',
    props: {
      areas: template,
      areaNames,
      rows,
      columns,
      ...(areaOptions.rowGap === undefined ? {} : { rowGap: decodeLayoutCellCount(areaOptions.rowGap, 'grid rowGap') }),
      ...(areaOptions.columnGap === undefined ? {} : { columnGap: decodeLayoutCellCount(areaOptions.columnGap, 'grid columnGap') }),
      ...decodeLayoutFlowOptions(areaOptions, 'grid')
    },
    children: toRenderNodes(
      areaNames
        .map((name) => areaOptions.children[name])
        .filter((child): child is ElementValue => child !== undefined)
    ),
    ...componentMetaProps(areaOptions)
  });
}
