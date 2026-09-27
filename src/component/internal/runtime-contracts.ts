import type { ElementFocus, ElementLayer, ElementStyles } from '../../element/metadata.ts';
import type { RenderNode } from '../../renderer/internal/render-tree/component-node.ts';
import type {
  ComponentDefinition,
  ComponentIdentity,
  ComponentMetadataCapability,
  ComponentSlotCardinality,
  ComponentSlotMessagePolicy,
  ComponentSlotOwner,
  ComponentSlotsDefinition,
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
  readonly actionful: boolean;
}

export interface RuntimeComponentSlot {
  readonly name: string;
  readonly cardinality: ComponentSlotCardinality;
  readonly owner: ComponentSlotOwner;
  readonly messages: ComponentSlotMessagePolicy;
}

export interface CompiledComponentDefinition<
  TOptions extends object,
  TModel extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotsDefinition,
  TVisualStates extends readonly ComponentVisualState[]
> {
  readonly definition: ComponentDefinition<
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
  readonly contract: ComponentRuntimeContract;
}
