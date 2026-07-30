import { layoutElementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import type { RenderNode } from '../../renderer/model/index.ts';
import type { Element, ElementChildren, ElementChildrenMessage, ElementMessage, ElementOptions } from '../../element/index.ts';
import type { AbsoluteOptions, SurfaceOptions } from '../options.ts';
import { renderNodeMeta as componentMetaProps } from '../../renderer/model/metadata.ts';
import {
  optionalRenderNodeId,
  renderNodeChildren
} from '../../renderer/model/element.ts';
import { assertSurfaceChild, surfaceLayoutProps } from './internals.ts';
import { normalizeBorderTitle } from '../../visual/border.ts';
import {
  assertFiniteNumber,
  assertOptionalEnum,
  assertOptionalFiniteNumber
} from '../../foundation/validation.ts';

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
  assertOptionalEnum(options.appearance, ['neutral', 'bar', 'raised', 'inset'], 'surface() appearance');
  return layoutElementFromRenderNode<'surface', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'surface',
    props: {
      ...(options.title === undefined ? {} : { title: normalizeBorderTitle(options.title) }),
      ...(options.appearance === undefined ? {} : { appearance: options.appearance }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.shadow === undefined ? {} : { shadow: options.shadow }),
      ...surfaceLayoutProps(options)
    },
    children: [toRenderNode(child)] as readonly RenderNode<Message>[],
    ...componentMetaProps(options.meta)
  }, false);
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
  assertFiniteNumber(options.row, 'absolute() row');
  assertFiniteNumber(options.column, 'absolute() column');
  assertOptionalFiniteNumber(options.width, 'absolute() width');
  assertOptionalFiniteNumber(options.height, 'absolute() height');
  return layoutElementFromRenderNode<'absolute', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'absolute',
    props: {
      row: options.row,
      column: options.column,
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height })
    },
    children: [toRenderNode(child)] as readonly RenderNode<Message>[],
    ...componentMetaProps(options.meta)
  }, false);
}

export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: ElementOptions
): Element<ElementChildrenMessage<TChildren>>;
export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options: ElementOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'overlay', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'overlay',
    props: {},
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  }, false);
}
