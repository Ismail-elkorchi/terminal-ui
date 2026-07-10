import type { Element, ElementChildren, ElementChildrenMessage } from '../components/element.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './types.ts';

const renderNodes = new WeakMap<object, unknown>();

export function elementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage = never
>(node: RenderNodeOfKind<TMessage, TKind>): Element<TMessage> {
  const element = Object.freeze({}) as Element<TMessage>;
  renderNodes.set(element, node);
  return element;
}

export function toRenderNode<TMessage>(element: Element<TMessage>): RenderNode<TMessage> {
  const node = isObject(element) ? renderNodes.get(element) : undefined;
  if (node === undefined) {
    throw new TypeError('Expected an Element created by a terminal-ui component or layout factory.');
  }
  return node as RenderNode<TMessage>;
}

export function toRenderNodes<const TChildren extends ElementChildren>(
  children: TChildren
): readonly RenderNode<ElementChildrenMessage<TChildren>>[] {
  const values: readonly Element<unknown>[] = Array.isArray(children)
    ? children
    : [children];
  return values.map((element) => toRenderNode(element)) as readonly RenderNode<ElementChildrenMessage<TChildren>>[];
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
