import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element, ElementChildren } from '../element.ts';
import type { RowOptions, StackOptions } from '../options/content.ts';
import { interactionProps } from '../factory-internals/interaction.ts';
import { assertTrackCount, layoutProps, optionalId, renderNodeChildren } from '../factory-internals/layout.ts';

export function stack<TMessage>(children: ElementChildren<TMessage>, options: StackOptions<TMessage> = {}): Element<TMessage> {
  const childList = renderNodeChildren(children);
  assertTrackCount('stack', options.sizes, childList.length);
  return elementFromRenderNode({
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

export function row<TMessage>(children: ElementChildren<TMessage>, options: RowOptions<TMessage> = {}): Element<TMessage> {
  const childList = renderNodeChildren(children);
  assertTrackCount('row', options.sizes, childList.length);
  return elementFromRenderNode({
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
