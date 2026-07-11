import { elementFromRenderNode, toRenderNode } from '../../render-node/element.ts';
import type { RenderNode } from '../../render-node/index.ts';
import type { Element, ElementMessage } from '../../components/element.ts';
import type { ViewportOptions } from '../options.ts';
import { interactionProps } from '../../components/factory-internals/interaction.ts';
import { layoutProps, requiredId } from '../../components/factory-internals/render-node.ts';

export function viewport<const TChild extends Element<unknown>, const TMessage = never>(
  child: TChild,
  options: ViewportOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage> {
  type Message = ElementMessage<TChild> | TMessage;
  const childNode = toRenderNode(child);
  return elementFromRenderNode<'viewport', Message>({
    ...requiredId(options.id, 'viewport'),
    kind: 'viewport',
    props: {
      ...(options.scrollRow === undefined ? {} : { scrollRow: options.scrollRow }),
      ...(options.scrollColumn === undefined ? {} : { scrollColumn: options.scrollColumn }),
      ...(options.contentRows === undefined ? {} : { contentRows: options.contentRows }),
      ...(options.contentColumns === undefined ? {} : { contentColumns: options.contentColumns }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...layoutProps(options)
    },
    children: [childNode] as readonly RenderNode<Message>[],
    ...interactionProps(options)
  });
}
