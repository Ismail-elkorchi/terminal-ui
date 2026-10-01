import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/types.ts';
import { isStringMember } from '../../foundation/validation.ts';
import {
  layoutElementFromRenderNode,
  optionalRenderNodeId,
  renderNodeChildren,
} from '../../renderer/internal/render-tree/element.ts';
import {
  renderNodeMeta as componentMetaProps,
} from '../../renderer/internal/render-tree/metadata.ts';
import { decodeLayoutCellCount, decodeLayoutFlowOptions, decodeLayoutTracks } from '../decode-options.ts';
import type { ColumnOptions, FlowOptions, RowOptions } from '../options.ts';
import { assertTrackCount } from './track-options.ts';

export function column<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: ColumnOptions
): Element<ElementChildrenMessage<TChildren>>;
export function column<const TChildren extends ElementChildren>(
  children: TChildren,
  options: ColumnOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  const childList = renderNodeChildren(children);
  const sizes = options.sizes === undefined ? undefined : decodeLayoutTracks(options.sizes, 'column sizes');
  assertTrackCount('column', sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'column', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'column',
    props: {
      ...(sizes === undefined ? {} : { sizes }),
      ...decodeLayoutFlowOptions(options, 'column')
    },
    children: childList,
    ...componentMetaProps(options)
  });
}

export function row<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: RowOptions
): Element<ElementChildrenMessage<TChildren>>;
export function row<const TChildren extends ElementChildren>(
  children: TChildren,
  options: RowOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  const childList = renderNodeChildren(children);
  const sizes = options.sizes === undefined ? undefined : decodeLayoutTracks(options.sizes, 'row sizes');
  assertTrackCount('row', sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'row', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'row',
    props: {
      ...(sizes === undefined ? {} : { sizes }),
      ...decodeLayoutFlowOptions(options, 'row')
    },
    children: childList,
    ...componentMetaProps(options)
  });
}

export function flow<const TChildren extends ElementChildren>(
  children: TChildren,
  options: FlowOptions
): Element<ElementChildrenMessage<TChildren>> {
  if (!isStringMember(options.direction, ['horizontal', 'vertical'])) {
    throw new TypeError('flow() direction must be horizontal or vertical.');
  }
  const gap = options.gap === undefined ? undefined : decodeLayoutCellCount(options.gap, 'flow() gap');
  const lineGap = options.lineGap === undefined ? undefined : decodeLayoutCellCount(options.lineGap, 'flow() lineGap');
  const childList = renderNodeChildren(children);
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'flow', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'flow',
    props: {
      direction: options.direction,
      ...(gap === undefined ? {} : { gap }),
      ...(lineGap === undefined ? {} : { lineGap })
    },
    children: childList,
    ...componentMetaProps(options)
  });
}
