import { layoutElementFromRenderNode } from '../../renderer/internal/render-tree/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type { ColumnOptions, FlowOptions, RowOptions } from '../options.ts';
import { renderNodeMeta as componentMetaProps } from '../../renderer/internal/render-tree/metadata.ts';
import { optionalRenderNodeId, renderNodeChildren } from '../../renderer/internal/render-tree/element.ts';
import { renderNodeLayoutProps } from '../../renderer/internal/render-tree/props/shared-layout.ts';
import { assertTrackCount } from './track-options.ts';
import {
  assertOptionalFiniteNumber,
  isStringMember
} from '../../foundation/validation.ts';

export function column<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: ColumnOptions
): Element<ElementChildrenMessage<TChildren>>;
export function column<const TChildren extends ElementChildren>(
  children: TChildren,
  options: ColumnOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  const childList = renderNodeChildren(children);
  assertTrackCount('column', options.sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'column', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'column',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...renderNodeLayoutProps(options)
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
  assertTrackCount('row', options.sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'row', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'row',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...renderNodeLayoutProps(options)
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
  assertOptionalFiniteNumber(options.gap, 'flow() gap');
  assertOptionalFiniteNumber(options.lineGap, 'flow() lineGap');
  if ((options.gap ?? 0) < 0 || (options.lineGap ?? 0) < 0) {
    throw new RangeError('flow() gaps must be non-negative.');
  }
  const childList = renderNodeChildren(children);
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'flow', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'flow',
    props: {
      direction: options.direction,
      ...(options.gap === undefined ? {} : { gap: options.gap }),
      ...(options.lineGap === undefined ? {} : { lineGap: options.lineGap })
    },
    children: childList,
    ...componentMetaProps(options)
  });
}
