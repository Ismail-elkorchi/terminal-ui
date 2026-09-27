import type { ElementLayer, ElementStyles } from '../../element/metadata.ts';
import type { ElementValue } from '../../element/types.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { RenderNode } from '../../renderer/internal/render-tree/component-node.ts';
import {
  mapElementMessages,
  markImplementationStructure,
  toMappedRenderNodes,
  toRenderNode,
  toRenderNodes,
} from '../../renderer/internal/render-tree/component-node.ts';
import type {
  ComponentBehaviorInput,
  ComponentCallerSlotValues,
  ComponentCapturedMessageInput,
  ComponentDefinition,
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentSlotsDefinition,
  ComponentStateCapability,
  ComponentVisualState,
  SemanticComposedComponentDefinition,
  SemanticCompositeComponentDefinition,
} from '../contracts.ts';
import { executeComponentPhase, type ComponentDefinitionName } from '../execution-error.ts';
import { mapComponentAction } from '../message.ts';
import type {
  ComponentInstanceOptions,
  ComponentRuntimeContract,
  ComponentSlotContent,
  ComponentSlotRange,
  RuntimeComponentSlot,
} from './runtime-contracts.ts';

export function componentInstanceSlotContent<
  TOptions extends object,
  TModel extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotsDefinition,
  TVisualStates extends readonly ComponentVisualState[],
>(
  instance: ComponentInstanceOptions,
  definition: ComponentDefinition<
    TOptions,
    TModel,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TSlots,
    TVisualStates
  >,
  contract: ComponentRuntimeContract,
  behavior: ComponentBehaviorInput<TModel>,
  toActionMessage: ((action: unknown) => unknown) | undefined,
  styles: ElementStyles<string, ComponentVisualState> | undefined,
  requiredLayer: ElementLayer | undefined,
  disabled: boolean,
): ComponentSlotContent {
  if (definition.structure === 'leaf') return emptyComponentSlotContent;
  const layer = definition.structure === 'composed' && requiredLayer !== undefined
    ? Object.freeze({ ...instance.meta?.layer, ...requiredLayer })
    : undefined;
  return componentSlotChildren(
    instance,
    definition,
    contract,
    behavior,
    toActionMessage,
    styles,
    layer,
    disabled,
  );
}

const emptyComponentSlotContent: ComponentSlotContent = Object.freeze({
  children: Object.freeze([]),
  inspectionChildren: Object.freeze([]),
  ranges: Object.freeze([])
});

function componentSlotChildren<
  TOptions extends object,
  TModel extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotsDefinition,
  TVisualStates extends readonly ComponentVisualState[]
>(
  value: ComponentInstanceOptions,
  definition: SemanticCompositeComponentDefinition<
    TOptions,
    TModel,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TSlots,
    TVisualStates
  > | SemanticComposedComponentDefinition<
    TOptions,
    TModel,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TSlots,
    TVisualStates
  >,
  contract: ComponentRuntimeContract,
  behavior: ComponentBehaviorInput<TModel>,
  toActionMessage: ((action: unknown) => unknown) | undefined,
  styles: ElementStyles<string, ComponentVisualState> | undefined,
  layer: ElementLayer | undefined,
  disabled: boolean,
): ComponentSlotContent {
  if (definition.structure === 'composed') {
    const supplied = callerSlotInput(value, contract);
    const mappedRecord = Object.freeze(Object.fromEntries(contract.slots.map((slot) => [
      slot.name,
      mappedComposedSlotValue(
        supplied?.[slot.name],
        slot,
        definition.name,
        definition.capture,
        behavior,
        toActionMessage,
        value.id
      )
    ])));
    const mapped = mappedRecord as ComponentCallerSlotValues<TSlots>;
    const inspectionChildren = contract.slots.flatMap((slot) =>
      slotElements(mappedRecord[slot.name], slot, definition.name).map((element) => toRenderNode(element))
    );
    const callerOwnedRoots = new Set<object>(inspectionChildren);
    const composed = executeComponentPhase(definition.name, value.id, 'compose', () =>
      definition.compose.call(undefined, {
        ...behavior,
        slots: mapped,
        emit: (action) => mapComponentAction(action, toActionMessage),
        ...(styles === undefined ? {} : { styles }),
        ...(layer === undefined ? {} : { layer })
      })
    );
    const children = toRenderNodes([composed]).map((node) =>
      markImplementationStructure(node, callerOwnedRoots, disabled)
    );
    return Object.freeze({
      children,
      inspectionChildren: Object.freeze(inspectionChildren),
      ranges: Object.freeze(contract.slots.map((slot) => Object.freeze({
        name: slot.name,
        start: 0,
        count: 0,
        accessiblePaths: renderNodePaths(
          children,
          new Set(slotElements(mappedRecord[slot.name], slot, definition.name)
            .map((element) => toRenderNode(element)))
        )
      })))
    });
  }
  const suppliedValue = value.slots;
  const callerNames = new Set(contract.slots
    .filter((slot) => slot.owner === 'caller')
    .map((slot) => slot.name));
  const requiresSlots = contract.slots.some((slot) =>
    slot.owner === 'caller' && slot.cardinality !== 'optional'
  );
  if (suppliedValue !== undefined && !isNonArrayObject(suppliedValue)) {
    throw new TypeError(`Component "${definition.name}" slots must be an object.`);
  }
  const supplied = isNonArrayObject(suppliedValue) ? suppliedValue : undefined;
  if (requiresSlots && supplied === undefined) {
    throw new TypeError(`Component "${definition.name}" requires a slots object.`);
  }
  if (supplied !== undefined) {
    const unsupported = Object.keys(supplied).find((name) => !callerNames.has(name));
    if (unsupported !== undefined) {
      throw new TypeError(`Component "${definition.name}" received unknown or implementation-owned slot "${unsupported}".`);
    }
  }
  const implementation = definition.implementationSlots === undefined
    ? undefined
    : executeComponentPhase(definition.name, value.id, 'compose', () =>
        definition.implementationSlots?.call(undefined, {
          ...behavior,
          slots: Object.freeze({ ...(supplied ?? {}) }) as ComponentCallerSlotValues<TSlots>,
          emit: (action) => mapComponentAction(action, toActionMessage),
          ...(styles === undefined ? {} : { styles }),
          ...(layer === undefined ? {} : { layer })
        })
      );
  if (implementation !== undefined && !isNonArrayObject(implementation)) {
    throw new TypeError(`Component "${definition.name}" implementationSlots must return an object.`);
  }
  if (isNonArrayObject(implementation)) {
    const implementationNames = new Set(contract.slots
      .filter((slot) => slot.owner === 'implementation')
      .map((slot) => slot.name));
    const unsupported = Object.keys(implementation).find((name) => !implementationNames.has(name));
    if (unsupported !== undefined) {
      throw new TypeError(`Component "${definition.name}" produced unknown caller-owned slot "${unsupported}".`);
    }
  }
  const children: RenderNode[] = [];
  const inspectionChildren: RenderNode[] = [];
  const ranges: ComponentSlotRange[] = [];
  const implementationRecord: Readonly<Record<string, unknown>> | undefined =
    isNonArrayObject(implementation) ? implementation : undefined;
  for (const slot of contract.slots) {
    const content = slot.owner === 'caller'
      ? supplied?.[slot.name]
      : implementationRecord?.[slot.name];
    const elements = slotElements(content, slot, definition.name);
    const start = children.length;
    const mapped = slot.messages === 'bubble'
      ? toRenderNodes(elements)
      : toMappedRenderNodes(elements, (message) => {
          if (slot.messages === 'none') {
            throw new TypeError(
              `Component "${definition.name}" slot "${slot.name}" forbids child messages.`
            );
          }
          return executeComponentPhase(definition.name, value.id, 'action', () => mapComponentAction(
            definition.capture?.call(undefined, { ...behavior, slot: slot.name, message }),
            toActionMessage
          ));
        });
    const roots = slot.owner === 'implementation'
      ? mapped.map((node) => markImplementationStructure(node, new Set(), disabled))
      : mapped;
    children.push(...roots);
    if (slot.owner === 'caller') inspectionChildren.push(...mapped);
    ranges.push(Object.freeze({
      name: slot.name,
      start,
      count: elements.length,
      accessiblePaths: Object.freeze(roots.map((_root, index) => Object.freeze([start + index])))
    }));
  }
  return Object.freeze({
    children: Object.freeze(children),
    inspectionChildren: Object.freeze(inspectionChildren),
    ranges: Object.freeze(ranges)
  });
}

function renderNodePaths(
  roots: readonly RenderNode[],
  targets: ReadonlySet<object>
): readonly (readonly number[])[] {
  const paths: (readonly number[])[] = [];
  const visit = (
    nodes: readonly RenderNode[],
    parent: readonly number[]
  ): void => {
    nodes.forEach((node, index) => {
      const path = Object.freeze([...parent, index]);
      if (targets.has(node)) paths.push(path);
      if (node.children !== undefined) visit(node.children, path);
    });
  };
  visit(roots, []);
  return Object.freeze(paths);
}

function callerSlotInput(
  value: ComponentInstanceOptions,
  contract: ComponentRuntimeContract
): Readonly<Record<string, unknown>> | undefined {
  const suppliedValue = value.slots;
  const names = new Set(contract.slots.map((slot) => slot.name));
  const requiresSlots = contract.slots.some((slot) => slot.cardinality !== 'optional');
  if (suppliedValue !== undefined && !isNonArrayObject(suppliedValue)) {
    throw new TypeError(`Component "${contract.name}" slots must be an object.`);
  }
  const supplied = isNonArrayObject(suppliedValue) ? suppliedValue : undefined;
  if (requiresSlots && supplied === undefined) {
    throw new TypeError(`Component "${contract.name}" requires a slots object.`);
  }
  if (supplied !== undefined) {
    const unsupported = Object.keys(supplied).find((name) => !names.has(name));
    if (unsupported !== undefined) {
      throw new TypeError(`Component "${contract.name}" received unknown slot "${unsupported}".`);
    }
  }
  return supplied;
}

function mappedComposedSlotValue<TModel extends object, TAction>(
  value: unknown,
  slot: RuntimeComponentSlot,
  component: ComponentDefinitionName,
  capture: ((
    this: undefined,
    input: ComponentCapturedMessageInput<TModel>
  ) => MessageResolution<TAction>) | undefined,
  behavior: ComponentBehaviorInput<TModel>,
  toActionMessage: ((action: unknown) => unknown) | undefined,
  instanceId: string | undefined
): unknown {
  const elements = slotElements(value, slot, component);
  const mapped = elements.map((element) => slot.messages === 'bubble'
    ? element
    : mapElementMessages(element, (message) => {
        if (slot.messages === 'none') {
          throw new TypeError(`Component "${component}" slot "${slot.name}" forbids child messages.`);
        }
        return executeComponentPhase(component, instanceId, 'action', () => mapComponentAction(
          capture?.call(undefined, { ...behavior, slot: slot.name, message }),
          toActionMessage
        ));
      }));
  if (slot.cardinality === 'many') return Object.freeze(mapped);
  return mapped[0];
}

function slotElements(
  value: unknown,
  slot: RuntimeComponentSlot,
  component: string
): readonly ElementValue[] {
  if (slot.cardinality === 'many') {
    if (!Array.isArray(value)) {
      throw new TypeError(`Component "${component}" slot "${slot.name}" must be an array.`);
    }
    return value as readonly ElementValue[];
  }
  if (value === undefined) {
    if (slot.cardinality === 'optional') return [];
    throw new TypeError(`Component "${component}" requires slot "${slot.name}".`);
  }
  if (Array.isArray(value)) {
    throw new TypeError(`Component "${component}" slot "${slot.name}" accepts one element.`);
  }
  return [value as ElementValue];
}
