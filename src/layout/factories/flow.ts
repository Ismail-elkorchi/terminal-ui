import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type { ColumnOptions, RowOptions } from '../options.ts';
import { componentMetaProps } from '../../authoring/metadata.ts';
import { layoutProps, optionalId, renderNodeChildren } from '../../authoring/render-node.ts';
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
  return elementFromRenderNode<'column', Message>({
    ...optionalId(options.id),
    kind: 'column',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
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
  return elementFromRenderNode<'row', Message>({
    ...optionalId(options.id),
    kind: 'row',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: childList,
    ...componentMetaProps(options.meta)
  });
}
