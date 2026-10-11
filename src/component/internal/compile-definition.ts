import type { RuntimeComponentDefinition } from '../../renderer/internal/render-tree/component-node.ts';
import type { ComponentSlotsDefinition } from '../contracts.ts';
import { adaptDefinition } from './definition-adapter.ts';
import type {
  AuthoredComponentDefinition,
  CompiledComponentDefinition,
  RuntimeComponentSlot,
  PhaseHooks,
} from './runtime-contracts.ts';
import { instanceHookFields, rendererHookFields, slotHookFields } from './runtime-contracts.ts';

export function compileDefinition<TOptions extends object, TModel extends object, TAction>(
  definition: AuthoredComponentDefinition<TOptions, TModel, TAction>,
): CompiledComponentDefinition<TOptions, TModel, TAction> {
  // Capability declarations have one owned runtime representation, never a
  // second mutable copy retained alongside it. Hook views contain no author-
  // owned arrays or slot records; reuse selectors are copied separately.
  const { states: declaredStates, metadata: declaredMetadata, slots: declaredSlots,
    parts, visualStates } = definition;
  const ownedDefinition = snapshotHookSource(definition);
  const states = Object.freeze([...(declaredStates ?? [])]);
  const metadata = Object.freeze([...(declaredMetadata ?? [])]);
  const slots = normalizeSlots(declaredSlots);
  const actions = definition.semantics === 'decorative'
    ? Object.freeze([])
    : Object.freeze([
        ...(definition.keys === undefined ? [] : ['keyboard' as const]),
        ...(definition.onInput === undefined ? [] : ['input' as const]),
        ...(definition.onPaste === undefined ? [] : ['paste' as const]),
        ...(definition.onFocus === undefined && definition.onFocusTarget === undefined
          ? [] : ['focus' as const]),
        ...(definition.hitTargets === undefined ? [] : ['pointer' as const]),
      ]);
  return Object.freeze({
    instance: pickHooks(ownedDefinition, instanceHookFields),
    renderer: pickHooks(ownedDefinition, rendererHookFields),
    slots: pickHooks(ownedDefinition, slotHookFields),
    sensitiveInput: definition.semantics === 'semantic' && definition.sensitiveInput === true,
    actions,
    ...(definition.semantics === 'semantic' && typeof definition.accessibleRole === 'string'
      ? { accessibleRole: definition.accessibleRole } : {}),
    contract: Object.freeze({
      name: definition.name,
      identity: definition.identity,
      structure: definition.structure,
      semantics: definition.semantics,
      states,
      stateSet: new Set(states),
      metadata,
      metadataFieldSet: new Set([
        ...metadata.filter((field) => field !== 'styles'),
        'accessibleName',
        'paint',
      ]),
      slots,
      partSet: new Set(parts ?? []),
      visualStateSet: new Set(visualStates ?? []),
      emitsActions: definition.emitsActions === true,
    }),
  });
}

/** Preserve each union member's reuse restrictions while copying its selectors. */
function snapshotHookSource<T extends { readonly reuse?: object }>(definition: T): Readonly<T> {
  return Object.freeze({
    ...definition,
    ...(definition.reuse === undefined ? {} : { reuse: Object.freeze({ ...definition.reuse }) }),
  });
}

/** A structural projection, preserving the source union's discriminants. */
function pickHooks<T extends object, K extends string>(value: T, fields: readonly K[]): PhaseHooks<T, K> {
  return Object.freeze(Object.fromEntries(
    Object.entries(value).filter(([key]) => fields.some((field) => field === key)),
  )) as PhaseHooks<T, K>;
}

function normalizeSlots(
  value: ComponentSlotsDefinition | Readonly<Record<never, never>> | undefined,
): readonly RuntimeComponentSlot[] {
  if (value === undefined) return Object.freeze([]);
  return Object.freeze(Object.entries(value).map(([name, slot]) => Object.freeze({
    name,
    cardinality: slot.cardinality,
    owner: slot.owner,
    messages: slot.messages,
  })));
}

export function runtimeDefinition<TOptions extends object, TModel extends object, TAction>(
  compiled: CompiledComponentDefinition<TOptions, TModel, TAction>,
): RuntimeComponentDefinition {
  const { contract } = compiled;
  return Object.freeze({
    name: contract.name,
    sensitiveInput: compiled.sensitiveInput,
    inspection: Object.freeze({
      identity: contract.identity,
      structure: contract.structure,
      semantics: contract.semantics,
      states: contract.states,
      actions: compiled.actions,
      styleParts: Object.freeze([...contract.partSet]),
      visualStates: Object.freeze([...contract.visualStateSet]),
      ...(compiled.accessibleRole === undefined ? {} : { accessibleRole: compiled.accessibleRole }),
    }),
    renderer: adaptDefinition(compiled.renderer, contract),
  });
}
