import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type { RowOptions, StackOptions } from '../options.ts';
import { componentMetaProps } from '../../components/factory-internals/interaction.ts';
import { layoutProps, optionalId, renderNodeChildren } from '../../components/factory-internals/render-node.ts';
import { assertTrackCount } from './internals.ts';

export function stack<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: StackOptions
): Element<ElementChildrenMessage<TChildren>>;
export function stack<const TChildren extends ElementChildren>(
  children: TChildren,
  options: StackOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  const childList = renderNodeChildren(children);
  assertTrackCount('stack', options.sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren>;
  return elementFromRenderNode<'stack', Message>({
    ...optionalId(options.id),
    kind: 'stack',
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
