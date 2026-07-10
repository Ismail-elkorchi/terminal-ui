import { elementFromRenderNode, toRenderNode } from '../../render-node/element.ts';
import { assertCanvasPainter } from '../extension-validation.ts';
import type { Element, ElementChildren } from '../element.ts';
import type { AbsoluteOptions, CanvasOptions, OverlayOptions, SurfaceOptions } from '../options/surfaces.ts';
import { interactionProps } from '../factory-internals/interaction.ts';
import {
  assertSurfaceChild,
  optionalId,
  renderNodeChildren,
  surfaceLayoutProps
} from '../factory-internals/layout.ts';

export function canvas<TMessage>(options: CanvasOptions<TMessage>): Element<TMessage> {
  assertCanvasPainter(options.painter);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      ...(options.state === undefined ? {} : { state: options.state }),
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionProps(options)
  });
}

export function surface<TMessage>(child: Element<TMessage>, options: SurfaceOptions<TMessage> = {}): Element<TMessage> {
  assertSurfaceChild(child);
  return elementFromRenderNode({
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
    children: [toRenderNode(child)],
    ...interactionProps(options)
  });
}

export function absolute<TMessage>(child: Element<TMessage>, options: AbsoluteOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'absolute',
    props: {
      row: options.row,
      column: options.column,
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height })
    },
    children: [toRenderNode(child)],
    ...interactionProps(options)
  });
}

export function overlay<TMessage>(children: ElementChildren<TMessage>, options: OverlayOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'overlay',
    props: {},
    children: renderNodeChildren(children),
    ...interactionProps(options)
  });
}
