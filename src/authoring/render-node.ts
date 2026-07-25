import { renderNodeId } from '../foundation/identity.ts';
import { toRenderNodes } from '../renderer/model/element.ts';
import type { RenderNode } from '../renderer/model/index.ts';
import type { RenderNodeLayoutProps } from '../renderer/model/props/shared-layout.ts';
import type { LayoutFlowOptions } from '../geometry/types.ts';
import type { ElementChildren, ElementChildrenMessage } from '../element/index.ts';

export function renderNodeChildren<const TChildren extends ElementChildren>(
  children: TChildren
): readonly RenderNode<ElementChildrenMessage<TChildren>>[] {
  return toRenderNodes(children);
}

export function layoutProps(options: LayoutFlowOptions): RenderNodeLayoutProps & { readonly gap?: number } {
  return {
    ...(options.gap === undefined ? {} : { gap: options.gap }),
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.margin === undefined ? {} : { margin: options.margin }),
    ...(options.minWidth === undefined ? {} : { minWidth: options.minWidth }),
    ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.justify === undefined ? {} : { justify: options.justify }),
    ...(options.overflow === undefined ? {} : { overflow: options.overflow })
  };
}

export function optionalId(id: string | undefined): { readonly id?: string } {
  return id === undefined ? {} : { id: renderNodeId(id) };
}

export function requiredId(id: string | undefined, component: string): { readonly id: string } {
  if (id === undefined) throw new TypeError(`${component} requires an id.`);
  return { id: renderNodeId(id, component) };
}
