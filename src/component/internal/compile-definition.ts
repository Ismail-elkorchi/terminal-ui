import type {
  RuntimeComponentDefinition,
} from '../../renderer/internal/render-tree/component-node.ts';
import type {
  ComponentDefinition,
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentSlotsDefinition,
  ComponentStateCapability,
  ComponentVisualState,
} from '../contracts.ts';
import { adaptDefinition } from './definition-adapter.ts';
import type { CompiledComponentDefinition, RuntimeComponentSlot } from './runtime-contracts.ts';

export function compileDefinition<
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
  >
): CompiledComponentDefinition<
  TOptions,
  TModel,
  TAction,
  TPart,
  TStates,
  TIdentity,
  TMetadata,
  TSlots,
  TVisualStates
> {
  const ownedDefinition = Object.freeze({
    ...definition,
    ...(definition.reuse === undefined ? {} : { reuse: Object.freeze({ ...definition.reuse }) }),
  }) as typeof definition;
  return Object.freeze({
    definition: ownedDefinition,
    contract: Object.freeze({
      name: definition.name,
      identity: definition.identity,
      structure: definition.structure,
      semantics: definition.semantics,
      states: Object.freeze([...(definition.states ?? [])]),
      stateSet: new Set(definition.states ?? []),
      metadata: Object.freeze([...(definition.metadata ?? [])]),
      metadataFieldSet: new Set([
        ...(definition.metadata ?? []).filter((field) => field !== 'styles'),
        'accessibleName',
        'paint',
      ]),
      slots: normalizeSlots(definition.slots),
      partSet: new Set(definition.parts ?? []),
      visualStateSet: new Set(definition.visualStates ?? []),
      actionful: definition.semantics === 'semantic' && (
        definition.onLayout !== undefined ||
        definition.hitTargets !== undefined
        || definition.structure !== 'leaf' && definition.capture !== undefined
        || definition.keys !== undefined
        || definition.onInput !== undefined
        || definition.onPaste !== undefined
        || definition.onFocus !== undefined
        || definition.onFocusTarget !== undefined
      )
    })
  });
}

function normalizeSlots(
  value: ComponentSlotsDefinition | Readonly<Record<never, never>> | undefined
): readonly RuntimeComponentSlot[] {
  if (value === undefined) return Object.freeze([]);
  return Object.freeze(Object.entries(value).map(([name, slot]) => Object.freeze({
    name,
    cardinality: slot.cardinality,
    owner: slot.owner,
    messages: slot.messages
  })));
}

export function runtimeDefinition<
  TOptions extends object,
  TModel extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotsDefinition,
  TVisualStates extends readonly ComponentVisualState[]
>(compiled: CompiledComponentDefinition<
  TOptions,
  TModel,
  TAction,
  TPart,
  TStates,
  TIdentity,
  TMetadata,
  TSlots,
  TVisualStates
>): RuntimeComponentDefinition {
  const { contract, definition } = compiled;
  const actions = definition.semantics === 'decorative'
    ? Object.freeze([])
    : Object.freeze([
        ...(definition.keys === undefined ? [] : ['keyboard' as const]),
        ...(definition.onInput === undefined ? [] : ['input' as const]),
        ...(definition.onPaste === undefined ? [] : ['paste' as const]),
        ...(definition.onFocus === undefined && definition.onFocusTarget === undefined
          ? [] : ['focus' as const]),
        ...(definition.hitTargets === undefined
          ? []
          : ['pointer' as const])
      ]);
  return Object.freeze({
    name: definition.name,
    sensitiveInput: definition.semantics === 'semantic' && definition.sensitiveInput === true,
    inspection: Object.freeze({
      identity: definition.identity,
      structure: definition.structure,
      semantics: definition.semantics,
      states: contract.states,
      actions,
      styleParts: Object.freeze([...contract.partSet]),
      visualStates: Object.freeze([...contract.visualStateSet]),
      ...(definition.semantics === 'semantic' && typeof definition.accessibleRole === 'string'
        ? { accessibleRole: definition.accessibleRole }
        : {}),
    }),
    renderer: adaptDefinition(compiled)
  });
}
