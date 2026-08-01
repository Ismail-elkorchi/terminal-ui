import { layoutElementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import type { RenderNode } from '../../renderer/model/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import type { ViewportOptions } from '../options.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import {
  optionalRenderNodeId,
  requiredRenderNodeId
} from '../../renderer/model/element.ts';
import { renderNodeLayoutProps } from '../../renderer/model/props/shared-layout.ts';

export function viewport<const TChild extends Element<unknown>, const TMessage = never>(
  child: TChild,
  options: ViewportOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage> {
  type Message = ElementMessage<TChild> | TMessage;
  const childNode = toRenderNode(child);
  const interactive = options.onScroll !== undefined;
  return layoutElementFromRenderNode<'viewport', Message>({
    ...(interactive
      ? requiredRenderNodeId(options.id, 'viewport')
      : optionalRenderNodeId(options.id)),
    kind: 'viewport',
    props: {
      ...(options.offset?.row === undefined ? {} : { offsetRow: options.offset.row }),
      ...(options.offset?.column === undefined
        ? {}
        : { offsetColumn: options.offset.column }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...renderNodeLayoutProps(options)
    },
    children: [childNode] as readonly RenderNode<Message>[],
    ...interactionProps(options)
  });
}
