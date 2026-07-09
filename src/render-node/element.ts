import type { Element, ElementChildren } from '../components/element.ts';
import type { RenderNode } from './types.ts';

const renderNodes = new WeakMap<object, unknown>();

export function elementFromRenderNode<TMessage = never>(node: RenderNode<TMessage>): Element<TMessage> {
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

export function toRenderNodes<TMessage>(children: ElementChildren<TMessage>): readonly RenderNode<TMessage>[] {
  const values: readonly Element<TMessage>[] = Array.isArray(children)
    ? children
    : [children];
  return values.map(toRenderNode);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
