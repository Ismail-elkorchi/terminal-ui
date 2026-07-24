import { layoutElementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import type { RenderNode } from '../../renderer/model/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import type { ViewportOptions } from '../options.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import { layoutProps, requiredId } from '../../authoring/render-node.ts';

export function viewport<const TChild extends Element<unknown>, const TMessage = never>(
  child: TChild,
  options: ViewportOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage> {
  type Message = ElementMessage<TChild> | TMessage;
  const childNode = toRenderNode(child);
  return layoutElementFromRenderNode<'viewport', Message>({
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
