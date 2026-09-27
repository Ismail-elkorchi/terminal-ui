import type { Element } from '../element/types.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type {
  ComponentDefinition,
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentSlotsDefinition,
  ComponentStateCapability,
  ComponentVisualState,
  DecorativeLeafComponentDefinition,
  DecorativeLeafComponentFactory,
  DecorativeLeafDefinition,
  SemanticComposedComponentDefinition,
  SemanticCompositeComponentDefinition,
  SemanticCompositeComponentFactory,
  SemanticLeafComponentDefinition,
  SemanticLeafComponentFactory,
  SemanticLeafDefinition,
  StagedComponentFactory,
} from './contracts.ts';
import { compileDefinition, runtimeDefinition } from './internal/compile-definition.ts';
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

export function defineComponent<
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
  definition?: unknown
): unknown {
  if (arguments.length === 0) return defineComponent;
  assertDefinition(definition);
  const suppliedDefinition = definition as ComponentDefinition<
    TOptions,
    TModel,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TSlots,
    TVisualStates
  >;
  const compiled = compileDefinition(suppliedDefinition);
  const { contract } = compiled;
  const ownedDefinition = compiled.definition;
  const runtime = runtimeDefinition(compiled);
  const component = (value: unknown): Element<unknown> => createDefinedComponentElement(
    value,
    contract,
    ownedDefinition,
    runtime,
  );
  return Object.freeze(component);
}

export function defineSemanticLeafComponent<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  const TPart extends string = never,
  const TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  const TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  const TVisualStates extends readonly ComponentVisualState[] = readonly []
>(definition: SemanticLeafDefinition<
  TOptions,
  TModel,
  TAction,
  TPart,
  TStates,
  TIdentity,
  TMetadata,
  TVisualStates
>): SemanticLeafComponentFactory<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates>;

export function defineSemanticLeafComponent(definition: unknown): unknown {
  if (!isNonArrayObject(definition)) {
    throw new TypeError('Semantic leaf component definition must be an object.');
  }
  return (defineComponent as (value: unknown) => unknown)({
    ...definition,
    structure: 'leaf',
    semantics: 'semantic',
  });
}

export function defineDecorativeLeafComponent<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  const TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  const TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly [],
  const TVisualStates extends readonly ComponentVisualState[] = readonly []
>(definition: DecorativeLeafDefinition<
  TOptions,
  TModel,
  TPart,
  TIdentity,
  TMetadata,
  TVisualStates
>): DecorativeLeafComponentFactory<TOptions, TPart, TIdentity, TMetadata, TVisualStates>;

export function defineDecorativeLeafComponent(definition: unknown): unknown {
  if (!isNonArrayObject(definition)) {
    throw new TypeError('Decorative leaf component definition must be an object.');
  }
  return (defineComponent as (value: unknown) => unknown)({
    ...definition,
    structure: 'leaf',
    semantics: 'decorative',
  });
}
