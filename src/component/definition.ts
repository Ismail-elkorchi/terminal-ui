import type { Element } from '../element/types.ts';
import type {
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentSlotsDefinition,
  ComponentStateCapability,
  ComponentVisualState,
  DecorativeLeafComponentDefinition,
  DecorativeLeafComponentFactory,
  SemanticComposedComponentDefinition,
  SemanticCompositeComponentDefinition,
  SemanticCompositeComponentFactory,
  SemanticLeafComponentDefinition,
  SemanticLeafComponentFactory,
  StagedComponentFactory,
} from './contracts.ts';
import { compileDefinition, runtimeDefinition } from './internal/compile-definition.ts';
import type { AuthoredComponentDefinition } from './internal/runtime-contracts.ts';
import { assertDefinition } from './internal/definition-validation.ts';
import { createDefinedComponentElement } from './internal/instance.ts';

/** Declare component options and actions, then infer capabilities from the definition. */
export function defineComponent<TOptions extends object, TAction = never>(): StagedComponentFactory<TOptions, TAction>;

export function defineComponent<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  const TPart extends string = never,
  const TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  const TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  const TVisualStates extends readonly ComponentVisualState[] = readonly []
>(
  definition: SemanticLeafComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates>
): SemanticLeafComponentFactory<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates>;

export function defineComponent<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  const TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  const TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly [],
  const TVisualStates extends readonly ComponentVisualState[] = readonly []
>(
  definition: DecorativeLeafComponentDefinition<TOptions, TModel, TPart, TIdentity, TMetadata, TVisualStates>
): DecorativeLeafComponentFactory<TOptions, TPart, TIdentity, TMetadata, TVisualStates>;

export function defineComponent<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  const TPart extends string = never,
  const TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  const TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  const TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>,
  const TVisualStates extends readonly ComponentVisualState[] = readonly []
>(
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
  >
): SemanticCompositeComponentFactory<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates>;

export function defineComponent<TOptions extends object, TModel extends object, TAction>(
  definition?: unknown
): unknown {
  if (arguments.length === 0) return defineComponent;
  assertDefinition(definition);
  // The public overloads establish literal capabilities and hook relationships.
  // Runtime validation above handles untyped callers; erase only capabilities here.
  const suppliedDefinition = definition as AuthoredComponentDefinition<TOptions, TModel, TAction>;
  const compiled = compileDefinition(suppliedDefinition);
  const runtime = runtimeDefinition(compiled);
  const component = (value: unknown): Element<unknown> => createDefinedComponentElement(
    value,
    compiled,
    runtime,
  );
  return Object.freeze(component);
}
