import { elementFromRenderNode, toRenderNode } from '../../render-node/element.ts';
import type { RenderNode } from '../../render-node/index.ts';
import { assertCanvasPainter } from '../extension-validation.ts';
import type { Element, ElementChildren, ElementChildrenMessage, ElementMessage } from '../element.ts';
import type { AbsoluteOptions, CanvasOptions, OverlayOptions, SurfaceOptions } from '../options/surfaces.ts';
import { interactionProps } from '../factory-internals/interaction.ts';
import {
  assertSurfaceChild,
  optionalId,
  renderNodeChildren,
  surfaceLayoutProps
} from '../factory-internals/layout.ts';

export function canvas(options: CanvasOptions): Element;
export function canvas<const TMessage>(options: CanvasOptions<TMessage>): Element<TMessage>;
export function canvas<const TMessage = never>(options: CanvasOptions<TMessage>): Element<TMessage> {
  assertCanvasPainter(options.painter);
  return elementFromRenderNode<'canvas', TMessage>({
    ...optionalId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionProps(options)
  });
}

export function surface<const TChild extends Element<unknown>>(
  child: TChild,
  options?: SurfaceOptions
): Element<ElementMessage<TChild>>;
export function surface<const TChild extends Element<unknown>, const TMessage>(
  child: TChild,
  options: SurfaceOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage>;
export function surface<const TChild extends Element<unknown>, const TMessage = never>(
  child: TChild,
  options: SurfaceOptions<TMessage> = {}
): Element<ElementMessage<TChild> | TMessage> {
  type Message = ElementMessage<TChild> | TMessage;
  assertSurfaceChild(child);
  return elementFromRenderNode<'surface', Message>({
    ...optionalId(options.id),
    kind: 'surface',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.visualState === undefined ? {} : { visualState: options.visualState }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.shadow === undefined ? {} : { shadow: options.shadow }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...surfaceLayoutProps(options)
    },
    children: [toRenderNode(child)] as readonly RenderNode<Message>[],
    ...interactionProps(options)
  });
}

export function absolute<const TChild extends Element<unknown>>(
  child: TChild,
  options: AbsoluteOptions
): Element<ElementMessage<TChild>>;
export function absolute<const TChild extends Element<unknown>, const TMessage>(
  child: TChild,
  options: AbsoluteOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage>;
export function absolute<const TChild extends Element<unknown>, const TMessage = never>(
  child: TChild,
  options: AbsoluteOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage> {
  type Message = ElementMessage<TChild> | TMessage;
  return elementFromRenderNode<'absolute', Message>({
    ...optionalId(options.id),
    kind: 'absolute',
    props: {
      row: options.row,
      column: options.column,
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height })
    },
    children: [toRenderNode(child)] as readonly RenderNode<Message>[],
    ...interactionProps(options)
  });
}

export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: OverlayOptions
): Element<ElementChildrenMessage<TChildren>>;
export function overlay<const TChildren extends ElementChildren, const TMessage>(
  children: TChildren,
  options: OverlayOptions<TMessage>
): Element<ElementChildrenMessage<TChildren> | TMessage>;
export function overlay<const TChildren extends ElementChildren, const TMessage = never>(
  children: TChildren,
  options: OverlayOptions<TMessage> = {}
): Element<ElementChildrenMessage<TChildren> | TMessage> {
  type Message = ElementChildrenMessage<TChildren> | TMessage;
  return elementFromRenderNode<'overlay', Message>({
    ...optionalId(options.id),
    kind: 'overlay',
    props: {},
    children: renderNodeChildren(children),
    ...interactionProps(options)
  });
}
