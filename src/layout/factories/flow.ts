import { layoutElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type { ColumnOptions, RowOptions } from '../options.ts';
import { renderNodeMeta as componentMetaProps } from '../../renderer/model/metadata.ts';
import { optionalRenderNodeId, renderNodeChildren } from '../../renderer/model/element.ts';
import { renderNodeLayoutProps } from '../../renderer/model/props/shared-layout.ts';
import { assertTrackCount } from './internals.ts';

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
    ...componentMetaProps(options.meta)
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
    ...componentMetaProps(options.meta)
  });
}
