import { layoutElementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import type { RenderNode } from '../../renderer/model/index.ts';
import type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage,
  StructuralElementOptions
} from '../../element/index.ts';
import { adoptElementStyles } from '../../element/styles.ts';
import type {
  AbsoluteOptions,
  AnchoredOptions,
  PortalOptions,
  SurfaceOptions
} from '../options.ts';
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
import { assertAnchoredSurfaceOptions } from '../../interaction/anchored-surface.ts';

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
    ...componentMetaProps({
      ...options,
      ...(options.styles === undefined ? {} : {
        styles: adoptElementStyles(options.styles, {
          subject: 'surface() styles',
          parts: new Set(['border', 'title']),
          states: new Set(),
        }),
      }),
    })
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
    ...componentMetaProps(options)
  });
}

export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options?: StructuralElementOptions
): Element<ElementChildrenMessage<TChildren>>;
export function overlay<const TChildren extends ElementChildren>(
  children: TChildren,
  options: StructuralElementOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return layoutElementFromRenderNode<'overlay', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'overlay',
    props: {},
    children: renderNodeChildren(children),
    ...componentMetaProps(options)
  });
}

export function anchored<const TChild extends Element<unknown>>(
  child: TChild,
  options: AnchoredOptions
): Element<ElementMessage<TChild>> {
  assertAnchoredSurfaceOptions(options, 'anchored()');
  type Message = ElementMessage<TChild>;
  return layoutElementFromRenderNode<'anchored', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'anchored',
    props: {
      anchor: options.anchor,
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
      ...(options.margin === undefined ? {} : { margin: options.margin }),
      ...(options.fit === undefined ? {} : { fit: options.fit })
    },
    children: [toRenderNode(child)],
    ...componentMetaProps(options)
  });
}

/**
 * Places a child in a separate layout region without contributing its size to
 * the parent's intrinsic measurement. The child remains bounded by the
 * terminal viewport and participates in normal layering and interaction.
 */
export function portal<
  const TChild extends Element<unknown>,
  const TOutsideMessage = never
>(
  child: TChild,
  options: PortalOptions<TOutsideMessage>
): Element<ElementMessage<TChild> | TOutsideMessage> {
  if (options.onOutsidePress !== undefined && typeof options.onOutsidePress !== 'function') {
    throw new TypeError('portal() onOutsidePress must be a function when provided.');
  }
  if (options.anchor.kind !== 'allocation') {
    assertAnchoredSurfaceOptions(options, 'portal()');
  } else {
    assertPortalPlacement(options);
  }
  type Message = ElementMessage<TChild> | TOutsideMessage;
  return layoutElementFromRenderNode<'portal', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'portal',
    props: {
      anchor: options.anchor,
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
      ...(options.margin === undefined ? {} : { margin: options.margin }),
      ...(options.fit === undefined ? {} : { fit: options.fit }),
      ...(options.onOutsidePress === undefined ? {} : { toOutsideMessage: options.onOutsidePress })
    },
    children: [toRenderNode(child)],
    ...componentMetaProps(options)
  });
}

function assertPortalPlacement(options: PortalOptions<unknown>): void {
  if (options.placement === 'center') {
    if (options.fallback !== undefined) {
      throw new TypeError('portal() fallback is not supported for centered placement.');
    }
    assertOptionalFiniteNumber(options.margin, 'portal() margin');
    return;
  }
  const probe = {
    anchor: { kind: 'target' as const, bounds: { row: 0, column: 0, width: 0, height: 0 } },
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
    ...(options.margin === undefined ? {} : { margin: options.margin }),
    ...(options.fit === undefined ? {} : { fit: options.fit })
  };
  assertAnchoredSurfaceOptions(probe, 'portal()');
}
