import type { Element, ElementChildren, ElementChildrenMessage } from '../components/element.ts';
import type { ElementInspection } from '../components/inspection.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './types.ts';

const renderNodes = new WeakMap<object, unknown>();
const inspections = new WeakMap<object, ElementInspection>();

export function elementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage = never
>(node: RenderNodeOfKind<TMessage, TKind>): Element<TMessage> {
  const element = Object.freeze({}) as Element<TMessage>;
  renderNodes.set(element, node);
  inspections.set(element, inspectRenderNode(node));
  return element;
}

export function inspectElementInternal(element: Element<unknown>): ElementInspection {
  const inspection = isObject(element) ? inspections.get(element) : undefined;
  if (inspection === undefined) {
    throw new TypeError('Expected an Element created by a terminal-ui component or layout factory.');
  }
  return inspection;
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

function inspectRenderNode<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>
): ElementInspection {
  const styleParts = Object.keys(node.styles?.parts ?? {}).sort();
  const styleStates = Object.keys(node.styles?.states ?? {}).sort();
  const keyboard = node.keyMap !== undefined && Object.keys(node.keyMap).length > 0;
  const inspection: ElementInspection = {
    schemaVersion: 'terminal-ui.element.v1',
    component: node.kind,
    ...(node.id === undefined ? {} : { id: node.id }),
    inputs: Object.freeze({
      keyboard,
      text: node.inputMap?.text !== undefined,
      paste: node.inputMap?.paste !== undefined,
      focus: focusCapability(node)
    }),
    meta: Object.freeze({
      accessibility: node.accessibility !== undefined,
      styled: node.styles !== undefined,
      styleParts: Object.freeze(styleParts),
      styleStates: Object.freeze(styleStates),
      layered: node.layer !== undefined
    }),
    children: Object.freeze((node.children ?? []).map(inspectRenderNode))
  };
  return Object.freeze(inspection);
}

function focusCapability<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>
): ElementInspection['inputs']['focus'] {
  if (node.focus === undefined || node.focus.disabled === true) return 'none';
  return node.focus.scope === 'contain' ? 'scope' : 'item';
}
