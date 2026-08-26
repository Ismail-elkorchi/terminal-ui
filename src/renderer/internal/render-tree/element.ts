import type { Element, ElementChildren, ElementChildrenMessage, ElementMessage, ElementValue } from '../../../element/index.ts';
import {
  inspectRegisteredElement,
  internalElementValue,
  registerElement
} from '../../../element/registry.ts';
import type {
  ElementFactoryCategory,
  ElementFactoryIdentity,
  ElementInspection
} from '../../../element/inspection.ts';
import { renderNodeId } from '../../../foundation/identity.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './types.ts';
import { renderNodeFocusUnavailable } from './node.ts';

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

function elementFromRenderNode<
  const TKind extends RenderNodeKind,
  TMessage
>(
  node: RenderNodeOfKind<TMessage, TKind>,
  category: ElementFactoryCategory
): Element<TMessage> {
  const inspection = inspectRenderNode(node, factoryIdentity(node, category));
  renderNodeInspections.set(node, inspection);
  return registerElement<TMessage>(node, inspection);
}

export function toRenderNode<TElement extends ElementValue>(element: TElement): RenderNode<ElementMessage<TElement>> {
  return internalElementValue(element) as RenderNode<ElementMessage<TElement>>;
}

export function toRenderNodes<const TChildren extends ElementChildren>(
  children: TChildren
): readonly RenderNode<ElementChildrenMessage<TChildren>>[] {
  const values: readonly ElementValue[] = Array.isArray(children)
    ? children
    : [children];
  return values.map((element) => toRenderNode(element));
}

/**
 * Marks layout nodes created by a component implementation as transparent to
 * focus identity. Caller-owned slot roots and nested component roots remain
 * stable identity boundaries.
 */
export function markImplementationStructure<TMessage>(
  node: RenderNode<TMessage>,
  callerOwnedRoots: ReadonlySet<object> = new Set(),
  disabled = false,
): RenderNode<TMessage> {
  if (callerOwnedRoots.has(node)) return node;
  if (node.kind === 'component') {
    if (!disabled) return node;
    const unavailable = {
      ...node,
      state: { ...node.state, disabled: true },
      ...(node.children === undefined
        ? {}
        : {
            children: node.children.map((child) =>
              markImplementationStructure(child, callerOwnedRoots, true)
            ),
          }),
    } as RenderNode<TMessage>;
    const componentInspection = renderNodeInspections.get(node);
    if (componentInspection !== undefined) {
      renderNodeInspections.set(unavailable, componentInspection);
    }
    return unavailable;
  }
  const marked = {
    ...node,
    transparentFocusIdentity: true as const,
    ...(disabled ? { state: { ...node.state, disabled: true } } : {}),
    ...(node.children === undefined
      ? {}
      : {
          children: node.children.map((child) =>
            markImplementationStructure(child, callerOwnedRoots, disabled)
          )
        })
  } as RenderNode<TMessage>;
  const inspection = renderNodeInspections.get(node);
  if (inspection !== undefined) renderNodeInspections.set(marked, inspection);
  return marked;
}

export function toMappedRenderNodes(
  children: ElementChildren,
  mapper: (message: unknown) => unknown
): readonly RenderNode[] {
  return toRenderNodes(children).map((node) => mapRenderNodeMessages(node, mapper));
}

export function mapElementMessages(
  element: ElementValue,
  mapper: (message: unknown) => unknown
): Element<unknown> {
  const node = toRenderNode(element);
  const mapped = mapRenderNodeMessages(node, mapper);
  const inspection = inspectRegisteredElement(element);
  renderNodeInspections.set(mapped, inspection);
  return registerElement(mapped, inspection);
}

function mapRenderNodeMessages<TMessage>(
  node: RenderNode<TMessage>,
  mapper: (message: unknown) => unknown
): RenderNode {
  const inherited = node.messageMap;
  const mapped = {
    ...node,
    messageMap: inherited === undefined
      ? mapper
      : (message) => mapper(inherited(message)),
    ...(node.children === undefined
      ? {}
      : { children: node.children.map((child) => mapRenderNodeMessages(child, mapper)) })
  } as RenderNode;
  const inspection = renderNodeInspections.get(node);
  if (inspection !== undefined) renderNodeInspections.set(mapped, inspection);
  return mapped;
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

function inspectRenderNode<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>,
  factory: ElementFactoryIdentity
): ElementInspection {
  const styleParts = Object.keys(node.styles?.parts ?? {}).sort();
  const styleStates = Object.keys(node.styles?.states ?? {}).sort();
  const keyboard = node.keyMap !== undefined && Object.keys(node.keyMap).length > 0;
  const inspection: ElementInspection = {
    factory,
    ...(node.kind === 'component' && node.definition !== undefined
      ? { component: componentInspection(node as RenderNodeOfKind<unknown, 'component'>) }
      : {}),
    ...(node.kind !== 'component' || node.semanticInspection === undefined
      ? {}
      : { semantic: node.semanticInspection }),
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
      configuredStyleParts: Object.freeze(styleParts),
      configuredStyleStates: Object.freeze(styleStates),
      layered: node.layer !== undefined
    }),
    children: Object.freeze((node.inspectionChildren ?? node.children ?? []).flatMap((child) => {
      const childInspection = renderNodeInspections.get(child);
      return childInspection === undefined ? [] : [childInspection];
    }))
  };
  return Object.freeze(inspection);
}

function componentInspection(
  node: RenderNodeOfKind<unknown, 'component'>,
): import('../../../element/inspection.ts').ComponentCapabilityInspection {
  const inspection = node.definition.inspection;
  if (inspection.semantics === 'decorative') {
    return Object.freeze({
      identity: inspection.identity,
      structure: inspection.structure,
      semantics: 'decorative',
      states: inspection.states,
      actions: inspection.actions,
      styleParts: inspection.styleParts,
      visualStates: inspection.visualStates,
    });
  }
  const accessibleRole = (node.props as {
    readonly accessibleRole?: import('../../../accessibility/types.ts').AccessibleRole;
  }).accessibleRole;
  if (accessibleRole === undefined) {
    throw new Error(`Semantic component "${node.definition.name}" has no resolved accessibility role.`);
  }
  return Object.freeze({ ...inspection, semantics: 'semantic', accessibleRole });
}

function factoryIdentity<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>,
  category: ElementFactoryCategory
): ElementFactoryIdentity {
  return Object.freeze({
    category,
    name: inspectedFactoryName(node)
  });
}

function inspectedFactoryName<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>
): string {
  if (node.kind !== 'component') return node.kind;
  if (node.definition === undefined) {
    throw new TypeError('A defined component render node must include its definition.');
  }
  return node.definition.name;
}

function focusCapability<TMessage, TKind extends RenderNodeKind>(
  node: RenderNodeOfKind<TMessage, TKind>
): ElementInspection['inputs']['focus'] {
  if (renderNodeFocusUnavailable(node)) return 'none';
  if (node.focus?.scope?.kind === 'contain') return 'scope';
  const hasKeyboard = node.keyMap !== undefined && Object.keys(node.keyMap).length > 0;
  const hasInput = node.inputMap?.text !== undefined || node.inputMap?.paste !== undefined;
  const hasDeclaredTargets = node.focusable === true
    || node.kind === 'component' && node.definition?.renderer.focusTargets !== undefined;
  return hasKeyboard || hasInput || hasDeclaredTargets ? 'item' : 'none';
}
