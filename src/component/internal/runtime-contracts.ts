import type { ElementFocus, ElementLayer, ElementPaint, ElementStyles } from '../../element/metadata.ts';
import type { RenderNode } from '../../renderer/internal/render-tree/component-node.ts';
import type {
  ComponentDefinitionShape,
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentSlotCardinality,
  ComponentSlotMessagePolicy,
  ComponentSlotOwner,
  ComponentStateCapability,
  ComponentVisualState,
} from '../contracts.ts';
import { type ComponentDefinitionName } from '../execution-error.ts';

export interface ComponentInstanceOptions {
  readonly id?: string;
  readonly slots?: unknown;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly readOnly?: boolean;
  readonly inert?: boolean;
  readonly onAction?: (action: unknown) => unknown;
  readonly styles?: ElementStyles<string, ComponentVisualState>;
  readonly meta?: {
    readonly focus?: ElementFocus;
    readonly layer?: ElementLayer;
    readonly paint?: ElementPaint;
    readonly accessibleName?: string;
  };
}

export interface ComponentSlotContent {
  readonly children: readonly RenderNode[];
  readonly inspectionChildren: readonly RenderNode[];
  readonly ranges: readonly ComponentSlotRange[];
}

export interface ComponentSlotRange {
  readonly name: string;
  readonly start: number;
  readonly count: number;
  readonly accessiblePaths: readonly (readonly number[])[];
}

export interface ComponentRuntimeContract {
  readonly name: ComponentDefinitionName;
  readonly identity: ComponentIdentity;
  readonly structure: 'leaf' | 'composite' | 'composed';
  readonly semantics: 'semantic' | 'decorative';
  readonly states: readonly ComponentStateCapability[];
  readonly stateSet: ReadonlySet<ComponentStateCapability>;
  readonly metadata: readonly ComponentMetadataCapability[];
  readonly metadataFieldSet: ReadonlySet<string>;
  readonly slots: readonly RuntimeComponentSlot[];
  readonly partSet: ReadonlySet<string>;
  readonly visualStateSet: ReadonlySet<ComponentVisualState>;
  readonly emitsActions: boolean;
}

export interface RuntimeComponentSlot {
  readonly name: string;
  readonly cardinality: ComponentSlotCardinality;
  readonly owner: ComponentSlotOwner;
  readonly messages: ComponentSlotMessagePolicy;
}

/** Only the authoring boundary sees the complete public definition. Capability
 * literals are checked there; normalized capability sets own runtime policy. */
export type AuthoredComponentDefinition<TOptions extends object, TModel extends object, TAction> =
  ComponentDefinitionShape<TOptions, TModel, TAction>;

// The phase projections share the public hook signatures without maintaining
// a second schema, and copy only the fields that each consumer can execute.
export const instanceHookFields = [
  'name', 'structure', 'semantics', 'createModel', 'reuse', 'layer',
  'inspection', 'accessibleRole', 'focusScope', 'focusNavigation',
  'onFocus', 'onFocusTarget', 'onInput', 'onPaste',
] as const;
export const rendererHookFields = [
  'name', 'structure', 'semantics', 'onLayout', 'keys', 'clipChildren',
  'measure', 'layout', 'render', 'renderBeforeChildren', 'renderAfterChildren',
  'accessibility', 'focusTargets', 'hitTargets',
] as const;
export const slotHookFields = [
  'name', 'structure', 'capture', 'compose', 'implementationSlots',
] as const;

export type PhaseHooks<T, K extends PropertyKey> = T extends object ? Pick<T, Extract<keyof T, K>> : never;

export type ComponentInstanceHooks<TOptions extends object, TModel extends object, TAction> =
  PhaseHooks<AuthoredComponentDefinition<TOptions, TModel, TAction>, typeof instanceHookFields[number]>;

export type ComponentRendererHooks<TModel extends object, TAction> =
  PhaseHooks<AuthoredComponentDefinition<TModel, TModel, TAction>, typeof rendererHookFields[number]>;

export type ComponentSlotDefinitionHooks<TModel extends object, TAction> =
  PhaseHooks<AuthoredComponentDefinition<TModel, TModel, TAction>, typeof slotHookFields[number]>;

export interface CompiledComponentDefinition<TOptions extends object, TModel extends object, TAction> {
  readonly instance: ComponentInstanceHooks<TOptions, TModel, TAction>;
  readonly renderer: ComponentRendererHooks<TModel, TAction>;
  readonly slots: ComponentSlotDefinitionHooks<TModel, TAction>;
  readonly contract: ComponentRuntimeContract;
  readonly sensitiveInput: boolean;
  readonly actions: readonly ('keyboard' | 'input' | 'paste' | 'focus' | 'pointer')[];
  readonly accessibleRole?: import('../../accessibility/types.ts').AccessibleRole;
}
