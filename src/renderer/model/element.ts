import type { Element, ElementChildren, ElementChildrenMessage, ElementMessage, ElementValue } from '../../element/index.ts';
import type { ElementInspection } from '../../element/inspection.ts';
import { renderNodeId } from '../../foundation/identity.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './types.ts';
import { renderNodeFocusDisabled } from './interaction.ts';

const renderNodes = new WeakMap<object, unknown>();
const inspections = new WeakMap<object, ElementInspection>();
const renderNodeInspections = new WeakMap<object, ElementInspection>();

export function componentElementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage = never
>(
  node: RenderNodeOfKind<TMessage, TKind>
): Element<TMessage> {
  return elementFromRenderNode(node, 'component');
}

export function layoutElementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage = never
>(
  node: RenderNodeOfKind<TMessage, TKind>
): Element<TMessage> {
  return elementFromRenderNode(node, 'layout');
}

export function extensionElementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage = never
>(
  node: RenderNodeOfKind<TMessage, TKind>
): Element<TMessage> {
  return elementFromRenderNode(node, 'extension');
}

function elementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage
>(
  node: RenderNodeOfKind<TMessage, TKind>,
  category: ElementInspection['category']
): Element<TMessage> {
  const element = Object.freeze({}) as Element<TMessage>;
  const inspection = inspectRenderNode(node, category);
  renderNodes.set(element, node);
  renderNodeInspections.set(node, inspection);
  inspections.set(element, inspection);
  return element;
}

export function inspectElementInternal(element: ElementValue): ElementInspection {
  const inspection = isObject(element) ? inspections.get(element) : undefined;
  if (inspection === undefined) {
    throw new TypeError('Expected an Element created by a terminal-ui component, layout, or renderer-extension factory.');
  }
  return inspection;
}

export function toRenderNode<TElement extends ElementValue>(element: TElement): RenderNode<ElementMessage<TElement>> {
  const node = isObject(element) ? renderNodes.get(element) : undefined;
  if (node === undefined) {
    throw new TypeError('Expected an Element created by a terminal-ui component, layout, or renderer-extension factory.');
  }
  return node as RenderNode<ElementMessage<TElement>>;
}

export function toRenderNodes<const TChildren extends ElementChildren>(
  children: TChildren
): readonly RenderNode<ElementChildrenMessage<TChildren>>[] {
  const values: readonly ElementValue[] = Array.isArray(children)
    ? children
    : [children];
  return values.map((element) => toRenderNode(element));
}

export function renderNodeChildren<const TChildren extends ElementChildren>(
  children: TChildren
): readonly RenderNode<ElementChildrenMessage<TChildren>>[] {
  return toRenderNodes(children);
}

export function optionalRenderNodeId(id: string | undefined): { readonly id?: string } {
  return id === undefined ? {} : { id: renderNodeId(id) };
}

export function requiredRenderNodeId(
  id: string | undefined,
  component: string
): { readonly id: string } {
  if (id === undefined) throw new TypeError(`${component} requires an id.`);
  return { id: renderNodeId(id, component) };
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function inspectRenderNode<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>,
  category: ElementInspection['category']
): ElementInspection {
  const styleParts = Object.keys(node.styles?.parts ?? {}).sort();
  const styleStates = Object.keys(node.styles?.states ?? {}).sort();
  const keyboard = node.keyMap !== undefined && Object.keys(node.keyMap).length > 0;
  const inspection: ElementInspection = {
    kind: node.kind === 'custom' && node.custom !== undefined
      ? node.custom.name
      : node.kind,
    category,
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
    children: Object.freeze((node.children ?? []).flatMap((child) => {
      const childInspection = renderNodeInspections.get(child);
      return childInspection === undefined ? [] : [childInspection];
    }))
  };
  return Object.freeze(inspection);
}

function focusCapability<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>
): ElementInspection['inputs']['focus'] {
  if (renderNodeFocusDisabled(node)) return 'none';
  if (node.focus?.scope?.kind === 'contain') return 'scope';
  const hasKeyboard = node.keyMap !== undefined && Object.keys(node.keyMap).length > 0;
  const hasInput = node.inputMap?.text !== undefined || node.inputMap?.paste !== undefined;
  const hasDeclaredTargets = node.focusable === true
    || node.kind === 'custom' && node.custom?.renderer.focusTargets !== undefined;
  return hasKeyboard || hasInput || hasDeclaredTargets ? 'item' : 'none';
}
