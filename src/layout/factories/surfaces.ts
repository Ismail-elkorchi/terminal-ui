import { elementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import type { RenderNode } from '../../renderer/model/index.ts';
import type { Element, ElementChildren, ElementChildrenMessage, ElementMessage } from '../../element/index.ts';
import type { AbsoluteOptions, OverlayOptions, SurfaceOptions } from '../options.ts';
import { renderNodeMeta as componentMetaProps } from '../../renderer/model/metadata.ts';
import {
  optionalId,
  renderNodeChildren
} from '../../authoring/render-node.ts';
import { assertSurfaceChild, surfaceLayoutProps } from './internals.ts';
import { normalizeBorderTitle } from '../../visual/border.ts';

export function surface<const TChild extends Element<unknown>>(
  child: TChild,
  options?: SurfaceOptions
): Element<ElementMessage<TChild>>;
export function surface<const TChild extends Element<unknown>>(
  child: TChild,
  options: SurfaceOptions = {}
): Element<ElementMessage<TChild>> {
  type Message = ElementMessage<TChild>;
  assertSurfaceChild(child);
  return elementFromRenderNode<'surface', Message>({
    ...optionalId(options.id),
    kind: 'surface',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.title === undefined ? {} : { title: normalizeBorderTitle(options.title) }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.visualState === undefined ? {} : { visualState: options.visualState }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.shadow === undefined ? {} : { shadow: options.shadow }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.focusWithin === undefined ? {} : { focusWithin: options.focusWithin }),
      ...surfaceLayoutProps(options)
    },
    children: [toRenderNode(child)] as readonly RenderNode<Message>[],
    ...componentMetaProps(options.meta)
  });
}

export function absolute<const TChild extends Element<unknown>>(
  child: TChild,
  options: AbsoluteOptions
): Element<ElementMessage<TChild>>;
export function absolute<const TChild extends Element<unknown>>(
  child: TChild,
  options: AbsoluteOptions
): Element<ElementMessage<TChild>> {
  type Message = ElementMessage<TChild>;
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
    ...componentMetaProps(options.meta)
  });
}

export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: OverlayOptions
): Element<ElementChildrenMessage<TChildren>>;
export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options: OverlayOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return elementFromRenderNode<'overlay', Message>({
    ...optionalId(options.id),
    kind: 'overlay',
    props: {},
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  });
}
