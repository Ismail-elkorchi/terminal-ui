import { isAccessibleRole } from '../../accessibility/types.ts';
import type { ComponentSemanticInspection } from '../../element/inspection-contracts.ts';
import type {
  ElementFocusScope,
  ElementLayer,
  ElementState,
  ElementStyles,
} from '../../element/metadata.ts';
import { decodeComponentSemanticInspection } from '../../element/semantic-inspection.ts';
import type { Element } from '../../element/types.ts';
import { renderNodeId } from '../../foundation/identity.ts';
import type {
  FocusLifecycleEvent,
  FocusNavigation,
  FocusTargetLifecycleEvent,
} from '../../interaction/focus.ts';
import type {
  RenderNodeOfKind,
  RuntimeComponentDefinition,
} from '../../renderer/internal/render-tree/component-node.ts';
import {
  componentElementFromRenderNode,
  renderNodeInteraction,
} from '../../renderer/internal/render-tree/component-node.ts';
import type {
  ComponentBehaviorInput,
  ComponentDefinition,
  ComponentDefinitionIdentity,
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentOptionsDefinition,
  ComponentReservedOption,
  ComponentSlotsDefinition,
  ComponentStateCapability,
  ComponentVisualState,
} from '../contracts.ts';
import { executeComponentPhase } from '../execution-error.ts';
import { mapComponentAction } from '../message.ts';
import {
  decodeElementLayer,
  decodeFocusScope,
  extractComponentOptions,
  normalizeComponentState,
} from './instance-validation.ts';
import type { ComponentInstanceOptions, ComponentRuntimeContract } from './runtime-contracts.ts';
import { componentInstanceSlotContent } from './slots.ts';
import { componentReuse } from './reuse.ts';

export function createDefinedComponentElement<
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
  value: unknown,
  contract: ComponentRuntimeContract,
  ownedDefinition: ComponentDefinition<
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
  runtime: RuntimeComponentDefinition,
): Element<unknown> {
    const instance = extractComponentOptions(value, contract);
    const state = ownedDefinition.semantics === 'decorative'
      ? emptyComponentState
      : normalizeComponentState(instance, contract.stateSet);
    const model = createComponentModel(instance, ownedDefinition, state);
    const toActionMessage = instance.onAction;
    const behavior = componentBehaviorInput(
      instance.id,
      instance.meta?.accessibleName,
      model,
      state
    );
    const semanticInspection = componentSemanticInspection(ownedDefinition, instance.id, behavior);
    const requiredLayer = componentDefinitionLayer(instance.id, ownedDefinition, behavior);
    const meta = componentInstanceMeta(
      instance,
      contract,
      behavior,
      requiredLayer,
      ownedDefinition.semantics === 'semantic' ? ownedDefinition.focusScope : undefined
    );
    const accessibleRole = componentAccessibleRole(ownedDefinition, behavior, instance.id);
    const focusNavigation = componentFocusNavigation(ownedDefinition, behavior, instance.id);
    const slotContent = componentInstanceSlotContent(
      instance,
      ownedDefinition,
      contract,
      behavior,
      toActionMessage,
      meta.styles,
      requiredLayer,
      state.disabled === true,
    );
    const children = ownedDefinition.structure === 'composite' || ownedDefinition.structure === 'composed'
      ? slotContent.children
      : undefined;
    const renderNode: RenderNodeOfKind<unknown, 'component'> = {
      ...(instance.id === undefined ? {} : { id: renderNodeId(instance.id, ownedDefinition.name) }),
      kind: 'component',
      props: {
        model,
        reuse: executeComponentPhase(ownedDefinition.name, instance.id, 'reuse', () => componentReuse(model, ownedDefinition.reuse)),
        slots: slotContent.ranges,
        ...(accessibleRole === undefined ? {} : { accessibleRole }),
        ...(meta.accessibleName === undefined ? {} : { accessibleName: meta.accessibleName }),
        ...(toActionMessage === undefined ? {} : { toActionMessage })
      },
      definition: runtime,
      ...(semanticInspection === undefined ? {} : { semanticInspection }),
      ...(Object.keys(state).length === 0 ? {} : { state }),
      ...(children === undefined ? {} : { children }),
      ...(ownedDefinition.structure === 'leaf'
        ? {}
        : { inspectionChildren: slotContent.inspectionChildren }),
      ...(ownedDefinition.semantics !== 'semantic' || ownedDefinition.onFocus === undefined
        ? {}
        : {
            focusLifecycle: (event: FocusLifecycleEvent) => executeComponentPhase(
              ownedDefinition.name,
              instance.id,
              'focus',
              () => mapComponentAction(
                ownedDefinition.onFocus?.call(undefined, event, behavior),
                toActionMessage,
              ),
            ),
          }),
      ...(ownedDefinition.semantics !== 'semantic' || ownedDefinition.onFocusTarget === undefined
        ? {}
        : {
            focusTargetLifecycle: (event: FocusTargetLifecycleEvent) => executeComponentPhase(
              ownedDefinition.name,
              instance.id,
              'focus',
              () => mapComponentAction(
                ownedDefinition.onFocusTarget?.call(undefined, event, behavior),
                toActionMessage,
              ),
            ),
          }),
      ...(focusNavigation === undefined ? {} : { focusNavigation }),
      ...renderNodeInteraction({
        onInput: ownedDefinition.semantics === 'semantic' && ownedDefinition.onInput !== undefined
          ? (text: string) => executeComponentPhase(ownedDefinition.name, instance.id, 'input', () =>
              mapComponentAction(
                ownedDefinition.onInput?.call(undefined, { ...behavior, text }),
                toActionMessage
              )
            )
          : undefined,
        onPaste: ownedDefinition.semantics === 'semantic' && ownedDefinition.onPaste !== undefined
          ? (text: string) => executeComponentPhase(ownedDefinition.name, instance.id, 'paste', () =>
              mapComponentAction(
                ownedDefinition.onPaste?.call(undefined, { ...behavior, text }),
                toActionMessage
              )
            )
          : undefined,
        meta,
        styles: meta.styles,
      })
    };
    return componentElementFromRenderNode<'component', unknown>(renderNode);
}

function componentSemanticInspection<TModel extends object>(
  definition: ComponentDefinitionIdentity & {
    readonly semantics: 'semantic' | 'decorative';
    readonly inspection?: (this: undefined, input: ComponentBehaviorInput<TModel>) => unknown;
  },
  instanceId: string | undefined,
  behavior: ComponentBehaviorInput<TModel>,
): ComponentSemanticInspection | undefined {
  if (definition.semantics === 'decorative' || definition.inspection === undefined) return undefined;
  return executeComponentPhase(definition.name, instanceId, 'inspection', () =>
    decodeComponentSemanticInspection(definition.inspection?.call(undefined, behavior))
  );
}

function componentAccessibleRole<TModel extends object>(
  definition: ComponentDefinitionIdentity & (
    | { readonly semantics: 'decorative' }
    | {
        readonly semantics: 'semantic';
        readonly accessibleRole:
          | import('../../accessibility/types.ts').AccessibleRole
          | ((this: undefined, input: ComponentBehaviorInput<TModel>) => import('../../accessibility/types.ts').AccessibleRole);
      }
  ),
  behavior: ComponentBehaviorInput<TModel>,
  instanceId: string | undefined,
): import('../../accessibility/types.ts').AccessibleRole | undefined {
  if (definition.semantics === 'decorative') return undefined;
  return resolveComponentAccessibleRole(definition, behavior, instanceId);
}

function componentFocusNavigation<TModel extends object>(
  definition: ComponentDefinitionIdentity & (
    | { readonly semantics: 'decorative' }
    | {
        readonly semantics: 'semantic';
        readonly focusNavigation?: (
          this: undefined,
          input: ComponentBehaviorInput<TModel>
        ) => unknown;
      }
  ),
  behavior: ComponentBehaviorInput<TModel>,
  instanceId: string | undefined,
): FocusNavigation | undefined {
  if (definition.semantics === 'decorative' || definition.focusNavigation === undefined) {
    return undefined;
  }
  return decodeFocusNavigation(executeComponentPhase(
    definition.name,
    instanceId,
    'focus',
    () => definition.focusNavigation?.call(undefined, behavior),
  ));
}

const emptyComponentState: Readonly<ElementState> = Object.freeze({});

const componentInstanceFields = new Set<ComponentReservedOption>([
  'id',
  'children',
  'slots',
  'disabled',
  'busy',
  'readOnly',
  'inert',
  'onAction',
  'meta',
  'styles',
  'keys',
  'onInput',
  'onPaste',
  'pointer'
]);

function decodeFocusNavigation(value: unknown): FocusNavigation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Component focusNavigation() must return an object.');
  }
  const orientation = (value as Record<string, unknown>)['orientation'];
  if (orientation !== 'horizontal' && orientation !== 'vertical') {
    throw new TypeError('Component focusNavigation() orientation is invalid.');
  }
  return Object.freeze({ orientation });
}

function createComponentModel<
  TOptions extends object,
  TModel extends object
>(
  value: ComponentInstanceOptions,
  definition: ComponentDefinitionIdentity & ComponentOptionsDefinition<TOptions, TModel>,
  state: Readonly<ElementState>
): Readonly<TModel> {
  const customEntries = Object.entries(value)
    .filter(([field]) => !componentInstanceFields.has(field as ComponentReservedOption));
  // This is the one type-erasure boundary between framework-owned fields and
  // the component's statically declared options.
  const custom = Object.freeze(Object.fromEntries(customEntries)) as Readonly<TOptions & TModel>;
  if (definition.createModel === undefined) {
    return custom;
  }
  const model = executeComponentPhase(definition.name, value.id, 'createModel', () =>
    definition.createModel.call(undefined, custom, {
      ...(value.id === undefined ? {} : { id: value.id }),
      disabled: state.disabled === true,
      busy: state.busy === true,
      readOnly: state.readOnly === true,
      inert: state.inert === true
    })
  );
  if (!isComponentModel(model)) {
    throw new TypeError(`Component "${definition.name}" createModel must return an object.`);
  }
  return model;
}

function isComponentModel(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function componentBehaviorInput<TModel extends object>(
  id: string | undefined,
  accessibleName: string | undefined,
  model: Readonly<TModel>,
  state: Readonly<ElementState>
): ComponentBehaviorInput<TModel> {
  return Object.freeze({
    ...(id === undefined ? {} : { id }),
    ...(accessibleName === undefined ? {} : { accessibleName }),
    model,
    disabled: state.disabled === true,
    busy: state.busy === true,
    readOnly: state.readOnly === true,
    inert: state.inert === true
  });
}

function resolveComponentAccessibleRole<TModel extends object>(
  definition: ComponentDefinitionIdentity & {
    readonly accessibleRole:
      | import('../../accessibility/types.ts').AccessibleRole
      | ((
          this: undefined,
          input: ComponentBehaviorInput<TModel>
        ) => import('../../accessibility/types.ts').AccessibleRole);
  },
  behavior: ComponentBehaviorInput<TModel>,
  instanceId: string | undefined,
): import('../../accessibility/types.ts').AccessibleRole {
  const resolver = definition.accessibleRole;
  if (typeof resolver !== 'function') return resolver;
  const role = executeComponentPhase(definition.name, instanceId, 'accessibility', () =>
    resolver.call(undefined, behavior));
  if (!isAccessibleRole(role)) {
    throw new TypeError(`Component "${definition.name}" accessibleRole resolver returned an invalid role.`);
  }
  return role;
}

function componentInstanceMeta<TModel extends object>(
  value: ComponentInstanceOptions,
  definition: ComponentRuntimeContract,
  behavior: ComponentBehaviorInput<TModel>,
  requiredLayer: ElementLayer | undefined,
  focusScope: ((
    this: undefined,
    input: ComponentBehaviorInput<TModel>
  ) => ElementFocusScope | undefined) | undefined
): ComponentInstanceOptions['meta'] & {
  readonly styles?: ElementStyles<string, ComponentVisualState>;
  readonly accessibility?: { readonly decorative: true };
} {
  const caller = value.meta;
  const requiredScope = focusScope === undefined
    ? undefined
    : executeComponentPhase(definition.name, value.id, 'metadata', () =>
        decodeFocusScope(
          focusScope.call(undefined, behavior),
          definition.name
        )
      );
  const focus = caller?.focus === undefined && requiredScope === undefined
    ? undefined
    : Object.freeze({
        ...(caller?.focus?.disabled === undefined ? {} : { disabled: caller.focus.disabled }),
        ...(caller?.focus?.order === undefined ? {} : { order: caller.focus.order }),
        ...(requiredScope === undefined ? {} : { scope: requiredScope })
      });
  const definitionOwnsComposedLayer = definition.structure === 'composed'
    && requiredLayer !== undefined;
  const callerRootLayer = definitionOwnsComposedLayer ? undefined : caller?.layer;
  const rootRequiredLayer = definition.structure === 'composed' ? undefined : requiredLayer;
  const layer = callerRootLayer === undefined && rootRequiredLayer === undefined
    ? undefined
    : Object.freeze({ ...callerRootLayer, ...rootRequiredLayer });
  const styles = value.styles;
  return Object.freeze({
    ...(focus === undefined ? {} : { focus }),
    ...(layer === undefined ? {} : { layer }),
    ...(caller?.accessibleName === undefined ? {} : { accessibleName: caller.accessibleName }),
    ...(styles === undefined ? {} : { styles }),
    ...(definition.semantics === 'decorative'
      ? { accessibility: Object.freeze({ decorative: true as const }) }
      : {})
  });
}

function componentDefinitionLayer<TModel extends object>(
  instanceId: string | undefined,
  definition: ComponentDefinitionIdentity & {
    readonly layer?: (
      this: undefined,
      input: ComponentBehaviorInput<TModel>
    ) => ElementLayer | undefined;
  },
  behavior: ComponentBehaviorInput<TModel>
): ElementLayer | undefined {
  return definition.layer === undefined
    ? undefined
    : executeComponentPhase(definition.name, instanceId, 'metadata', () =>
        decodeElementLayer(
          definition.layer?.call(undefined, behavior),
          definition.name,
          'definition'
        )
      );
}
