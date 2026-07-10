import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../element.ts';
import type { RowOptions, StackOptions } from '../options/content.ts';
import { interactionProps } from '../factory-internals/interaction.ts';
import { assertTrackCount, layoutProps, optionalId, renderNodeChildren } from '../factory-internals/layout.ts';

export function stack<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: StackOptions
): Element<ElementChildrenMessage<TChildren>>;
export function stack<const TChildren extends ElementChildren, const TMessage>(
  children: TChildren,
  options: StackOptions<TMessage>
): Element<ElementChildrenMessage<TChildren> | TMessage>;
export function stack<const TChildren extends ElementChildren, const TMessage = never>(
  children: TChildren,
  options: StackOptions<TMessage> = {}
): Element<ElementChildrenMessage<TChildren> | TMessage> {
  const childList = renderNodeChildren(children);
  assertTrackCount('stack', options.sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren> | TMessage;
  return elementFromRenderNode<'stack', Message>({
    ...optionalId(options.id),
    kind: 'stack',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: childList,
    ...interactionProps(options)
  });
}

export function row<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: RowOptions
): Element<ElementChildrenMessage<TChildren>>;
export function row<const TChildren extends ElementChildren, const TMessage>(
  children: TChildren,
  options: RowOptions<TMessage>
): Element<ElementChildrenMessage<TChildren> | TMessage>;
export function row<const TChildren extends ElementChildren, const TMessage = never>(
  children: TChildren,
  options: RowOptions<TMessage> = {}
): Element<ElementChildrenMessage<TChildren> | TMessage> {
  const childList = renderNodeChildren(children);
  assertTrackCount('row', options.sizes, childList.length);
  type Message = ElementChildrenMessage<TChildren> | TMessage;
  return elementFromRenderNode<'row', Message>({
    ...optionalId(options.id),
    kind: 'row',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: childList,
    ...interactionProps(options)
  });
}
