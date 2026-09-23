import { isAccessibleRole, type AccessibleNode } from '../accessibility/index.ts';
import type {
  Element,
  ElementMessage,
  ElementValue
} from '../element/index.ts';
import type {
  ElementFocus,
  ElementFocusScope,
  ElementKeyBindings,
  ElementLayer,
  ElementState,
  ElementStyles,
  ElementVisualState,
} from '../element/metadata.ts';
import { decodeComponentSemanticInspection } from '../element/semantic-inspection.ts';
import type { ComponentSemanticInspection } from '../element/inspection.ts';
import { renderNodeId } from '../foundation/identity.ts';
import {
  isNonArrayObject
} from '../foundation/validation.ts';
import type { Rect } from '../geometry/types.ts';
import type {
  MessageResolution,
  PointerInteractionState
} from '../interaction/index.ts';
import type {
  FocusLifecycleEvent,
  FocusNavigation,
  FocusTargetLifecycleEvent,
} from '../interaction/focus.ts';
import {
  componentElementFromRenderNode,
  markImplementationStructure,
  mapElementMessages,
  renderNodeInteraction,
  toRenderNode,
  toMappedRenderNodes,
  toRenderNodes
} from '../renderer/internal/render-tree/component-node.ts';
import type {
  RenderNode,
  RenderNodeOfKind,
  RuntimeComponentDefinition
} from '../renderer/internal/render-tree/component-node.ts';
import type {
  FocusTarget,
  HitTarget,
  Measurement,
  RenderFocusRelation,
  FrameSourceInput,
  RenderStyleInput,
  ComponentRenderTarget
} from '../renderer/contracts.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalStyle } from '../visual/render-content.ts';
import type { FrameCellSource } from '../visual/frame-source.ts';
import {
  executeComponentPhase,
  type ComponentDefinitionName
} from './execution-error.ts';
import { mapComponentAction, type ComponentMessage } from './message.ts';
import { assertDefinition } from './definition-validation.ts';
import { adaptDefinition } from './definition-adapter.ts';
import { extractComponentOptions, normalizeComponentState, decodeFocusScope, decodeElementLayer } from './instance-validation.ts';

export {
  ComponentExecutionError,
  type ComponentDefinitionName,
  type ComponentExecutionPhase
} from './execution-error.ts';
export type { ComponentMessage } from './message.ts';

export type ComponentStyleInput<TPart extends string> = RenderStyleInput<TPart>;
export type ComponentFrameSourceInput = FrameSourceInput;
export type ComponentStateCapability = keyof ElementState;
export type ComponentVisualState = Exclude<ElementVisualState, 'default'>;
export type ComponentIdentity = 'required' | 'optional';

export interface ComponentMeasureConstraints {
  readonly width: number;
  readonly height: number;
}

export type ComponentSlotCardinality = 'one' | 'optional' | 'many';
export type ComponentSlotOwner = 'caller' | 'implementation';
export type ComponentSlotMessagePolicy = 'bubble' | 'capture' | 'none';

interface ComponentSlotBase {
  readonly cardinality: ComponentSlotCardinality;
  readonly owner: ComponentSlotOwner;
  readonly messages: ComponentSlotMessagePolicy;
}

export interface CallerComponentSlot extends ComponentSlotBase {
  readonly owner: 'caller';
}

export interface ImplementationComponentSlot extends ComponentSlotBase {
  readonly owner: 'implementation';
}

export type ComponentSlotDefinition =
  | CallerComponentSlot
  | ImplementationComponentSlot;

export type ComponentSlotsDefinition = Readonly<
  Record<string, ComponentSlotDefinition>
>;

export type ComponentSlotShape = Readonly<Record<string, ComponentSlotBase>>;

export interface ComponentSlotMeasurements<TSlots extends ComponentSlotShape> {
  count(name: keyof TSlots & string): number;
  measure(name: keyof TSlots & string, index?: number): Measurement;
}

export type ComponentSlotLayout<TSlots extends ComponentSlotShape> = {
  readonly [TName in keyof TSlots]: TSlots[TName]['cardinality'] extends 'many'
    ? readonly Rect[]
    : TSlots[TName]['cardinality'] extends 'optional'
      ? Rect | undefined
      : Rect;
};

interface ComponentBehaviorInput<TModel extends object> {
  readonly id?: string;
  /** Caller-supplied human-facing name for compound semantic anatomy. */
  readonly accessibleName?: string;
  readonly model: Readonly<TModel>;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly inert: boolean;
}

export type ComponentInspectionInput<TModel extends object> =
  ComponentBehaviorInput<TModel>;

interface ComponentBaseInput<TModel extends object>
  extends ComponentBehaviorInput<TModel> {
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  /** Runtime-owned transient pointer state; present during painting only. */
  readonly pointerState?: PointerInteractionState;
}

export interface ComponentInput<TModel extends object>
  extends ComponentBaseInput<TModel> {
  readonly bounds: Rect;
  readonly viewport: Rect;
}

export interface ComponentKeyInput<TModel extends object>
  extends ComponentInput<TModel> {
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
}

export interface ComponentInteractionInput<
  TModel extends object,
  TPart extends string = string
> extends ComponentInput<TModel> {
  readonly style: (input: ComponentStyleInput<TPart>) => TerminalStyle | undefined;
  readonly frameSource: (input?: ComponentFrameSourceInput) => FrameCellSource;
}

/** Measures preferred and minimum cell sizes before layout; constraints bound available space. */
export interface ComponentMeasureInput<
  TModel extends object,
  TSlots extends ComponentSlotShape = ComponentSlotShape
>
  extends ComponentBaseInput<TModel> {
  readonly constraints: ComponentMeasureConstraints;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly slots: ComponentSlotMeasurements<TSlots>;
}

export interface ComponentLayoutInput<
  TModel extends object,
  TSlots extends ComponentSlotShape = ComponentSlotShape
>
  extends ComponentInput<TModel> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly slots: ComponentSlotMeasurements<TSlots>;
}

export interface ComponentCompositionInput<
  TModel extends object,
  TSlots extends ComponentSlotShape,
  TAction,
  TPart extends string = string,
  TVisualState extends ComponentVisualState = ComponentVisualState,
> extends ComponentBehaviorInput<TModel> {
  readonly slots: ComponentCallerSlotValues<TSlots>;
  readonly emit: (action: TAction) => MessageResolution<ComponentMessage>;
  readonly styles?: ElementStyles<TPart, TVisualState>;
  readonly layer?: ElementLayer;
}

export interface ComponentCapturedMessageInput<TModel extends object>
  extends ComponentBehaviorInput<TModel> {
  readonly slot: string;
  readonly message: unknown;
}

/** Input to a synchronous render hook. `target` uses zero-based local cells and is valid only during this call. */
export interface ComponentRenderInput<
  TModel extends object,
  TPart extends string = string
> extends ComponentInteractionInput<TModel, TPart> {
  readonly target: ComponentRenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
}

export interface ComponentAccessibilityInput<
  TModel extends object,
  TSlots extends ComponentSlotShape = ComponentSlotShape
>
  extends ComponentInput<TModel> {
  readonly id: string;
  readonly focused: boolean;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
  readonly children: readonly AccessibleNode[];
  readonly slots: ComponentAccessibleSlotValues<TSlots>;
}

export type ComponentAccessibleSlotValues<TSlots extends ComponentSlotShape> = {
  readonly [TName in keyof TSlots]: readonly AccessibleNode[];
};

export interface ComponentTextInput<TModel extends object>
  extends ComponentBehaviorInput<TModel> {
  readonly text: string;
}

interface ComponentDefinitionIdentity {
  /** A package-qualified identity such as `acme/widgets/badge`. */
  readonly name: ComponentDefinitionName;
}

interface ComponentModelDefinition<
  TOptions extends object,
  TModel extends object
> {
  readonly createModel: (
    this: undefined,
    value: Readonly<TOptions>,
    context: ComponentModelContext
  ) => TModel;
}

export interface ComponentModelContext {
  readonly id?: string;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly inert: boolean;
}

type ComponentOptionsDefinition<
  TOptions extends object,
  TModel extends object
> = ComponentModelDefinition<TOptions, TModel>
  | ([TOptions] extends [TModel]
      ? [TModel] extends [TOptions]
        ? { readonly createModel?: never }
        : never
      : never);

type ComponentDefinitionBase<
  TOptions extends object,
  TModel extends object,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TPart extends string,
  TVisualStates extends readonly ComponentVisualState[]
> = ComponentDefinitionIdentity & ComponentOptionsDefinition<TOptions, TModel> & {
  readonly identity: TIdentity;
  readonly states?: TStates;
  readonly parts?: readonly TPart[];
  readonly visualStates?: TVisualStates;
  readonly layer?: (
    this: undefined,
    input: ComponentBehaviorInput<TModel>
  ) => ElementLayer | undefined;
};

interface MeasuredComponentDefinition<
  TModel extends object,
  TSlots extends ComponentSlotShape
> {
  readonly measure: (
    this: undefined,
    input: ComponentMeasureInput<TModel, TSlots>
  ) => Measurement;
}

type ComponentFocusTargets<TModel extends object, TPart extends string> = (
  this: undefined,
  input: ComponentInteractionInput<TModel, TPart>
) => readonly FocusTarget[];

type ComponentFocusTargetLifecycle<TModel extends object, TAction> = (
  this: undefined,
  event: FocusTargetLifecycleEvent,
  input: ComponentBehaviorInput<TModel>
) => MessageResolution<TAction>;

type FocusTargetDefinition<TModel extends object, TAction, TPart extends string> =
  | {
      readonly focusTargets?: never;
      readonly onFocusTarget?: never;
    }
  | {
      readonly focusTargets: ComponentFocusTargets<TModel, TPart>;
      readonly onFocusTarget?: ComponentFocusTargetLifecycle<TModel, TAction>;
    };

type InteractiveDefinition<TModel extends object, TAction, TPart extends string> =
  FocusTargetDefinition<TModel, TAction, TPart> & {
  /** Prevents raw text events from being recorded while this component owns focus. */
  readonly sensitiveInput?: boolean;
  readonly hitTargets?: (
    this: undefined,
    input: ComponentInteractionInput<TModel, TPart>
  ) => readonly HitTarget<TAction>[];
  readonly keys?: (
    this: undefined,
    input: ComponentKeyInput<TModel>
  ) => ElementKeyBindings<TAction>;
  readonly onInput?: (
    this: undefined,
    input: ComponentTextInput<TModel>
  ) => MessageResolution<TAction>;
  readonly onPaste?: (
    this: undefined,
    input: ComponentTextInput<TModel>
  ) => MessageResolution<TAction>;
  readonly onFocus?: (
    this: undefined,
    event: FocusLifecycleEvent,
    input: ComponentBehaviorInput<TModel>
  ) => MessageResolution<TAction>;
  readonly focusNavigation?: (
    this: undefined,
    input: ComponentBehaviorInput<TModel>
  ) => FocusNavigation;
};

type SemanticDefinition<
  TModel extends object,
  TAction,
  TSlots extends ComponentSlotShape,
  TPart extends string
> = InteractiveDefinition<TModel, TAction, TPart> & {
  readonly semantics: 'semantic';
  readonly accessibleRole:
    | import('../accessibility/types.ts').AccessibleRole
    | ((
        this: undefined,
        input: ComponentBehaviorInput<TModel>
      ) => import('../accessibility/types.ts').AccessibleRole);
  readonly focusScope?: (
    this: undefined,
    input: ComponentBehaviorInput<TModel>
  ) => ElementFocusScope | undefined;
  readonly accessibility: (
    this: undefined,
    input: ComponentAccessibilityInput<TModel, TSlots>
  ) => AccessibleNode;
  readonly inspection?: (
    this: undefined,
    input: ComponentInspectionInput<TModel>
  ) => ComponentSemanticInspection;
};

interface DecorativeDefinition {
  readonly semantics: 'decorative';
  readonly accessibleRole?: never;
  readonly accessibility?: never;
  readonly inspection?: never;
  readonly focusTargets?: never;
  readonly hitTargets?: never;
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly sensitiveInput?: never;
}

export type ComponentMetadataCapability = 'focus' | 'layer' | 'styles';

export type SemanticLeafComponentDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = ComponentDefinitionBase<
  TOptions,
  TModel,
  TStates,
  TIdentity,
  TPart,
  TVisualStates
> & MeasuredComponentDefinition<TModel, Readonly<Record<never, never>>>
  & SemanticDefinition<TModel, TAction, Readonly<Record<never, never>>, TPart>
  & {
    readonly metadata?: TMetadata;
    readonly slots?: never;
    readonly structure: 'leaf';
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TModel, TPart>
    ) => undefined;
  };

export type DecorativeLeafComponentDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly [],
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = ComponentDefinitionBase<
  TOptions,
  TModel,
  readonly [],
  TIdentity,
  TPart,
  TVisualStates
> & MeasuredComponentDefinition<TModel, Readonly<Record<never, never>>>
  & DecorativeDefinition
  & {
    readonly metadata?: TMetadata;
    readonly slots?: never;
    readonly structure: 'leaf';
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TModel, TPart>
    ) => undefined;
  };

/** A semantic leaf definition with invariant structure fields supplied by the authoring helper. */
export type SemanticLeafDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = SemanticLeafComponentDefinition<
    TOptions,
    TModel,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TVisualStates
  > extends infer TDefinition
    ? TDefinition extends unknown
      ? Omit<TDefinition, 'structure' | 'semantics'>
      : never
    : never;

/** A decorative leaf definition with invariant structure fields supplied by the authoring helper. */
export type DecorativeLeafDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly [],
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = Omit<
  DecorativeLeafComponentDefinition<TOptions, TModel, TPart, TIdentity, TMetadata, TVisualStates>,
  'structure' | 'semantics'
>;

export type SemanticCompositeComponentDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>,
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = ComponentDefinitionBase<TOptions, TModel, TStates, TIdentity, TPart, TVisualStates>
  & MeasuredComponentDefinition<TModel, TSlots>
  & SemanticDefinition<TModel, TAction, TSlots, TPart>
  & {
    readonly metadata?: TMetadata;
    readonly slots: TSlots;
    readonly structure: 'composite';
    readonly capture?: (
      this: undefined,
      input: ComponentCapturedMessageInput<TModel>
    ) => MessageResolution<TAction>;
    readonly implementationSlots?: (
      this: undefined,
      input: ComponentCompositionInput<TModel, TSlots, TAction, TPart, TVisualStates[number]>
    ) => ComponentImplementationSlotValues<TSlots>;
    readonly clipChildren?: boolean;
    readonly layout: (
      this: undefined,
      input: ComponentLayoutInput<TModel, TSlots>
    ) => ComponentSlotLayout<TSlots>;
    readonly renderBeforeChildren?: (
      this: undefined,
      input: ComponentRenderInput<TModel, TPart>
    ) => undefined;
    readonly renderAfterChildren?: (
      this: undefined,
      input: ComponentRenderInput<TModel, TPart>
    ) => undefined;
  };

export type SemanticComposedComponentDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>,
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = ComponentDefinitionBase<TOptions, TModel, TStates, TIdentity, TPart, TVisualStates>
  & SemanticDefinition<TModel, TAction, TSlots, TPart>
  & {
    readonly metadata?: TMetadata;
    readonly slots?: TSlots;
    readonly structure: 'composed';
    readonly capture?: (
      this: undefined,
      input: ComponentCapturedMessageInput<TModel>
    ) => MessageResolution<TAction>;
    readonly compose: (
      this: undefined,
      input: ComponentCompositionInput<TModel, TSlots, TAction, TPart, TVisualStates[number]>
    ) => Element<ComponentMessage>;
    readonly clipChildren?: boolean;
  };

export type ComponentDefinition<
  TOptions extends object = Readonly<Record<never, never>>,
  TModel extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>,
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> =
  | SemanticLeafComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates>
  | DecorativeLeafComponentDefinition<TOptions, TModel, TPart, TIdentity, Extract<TMetadata, readonly ('layer' | 'styles')[]>, TVisualStates>
  | SemanticCompositeComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates>
  | SemanticComposedComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates>;

type ComponentReservedOption =
  | 'id'
  | 'children'
  | 'slots'
  | ComponentStateCapability
  | 'onAction'
  | 'meta'
  | 'styles'
  | 'keys'
  | 'onInput'
  | 'onPaste'
  | 'pointer';

type ComponentOwnOptions<TOptions extends object> =
  Extract<keyof TOptions, ComponentReservedOption> extends never
    ? Readonly<TOptions>
    : never;

type SlotElement<TSlot extends ComponentSlotBase> =
  TSlot['messages'] extends 'none' ? Element : Element<ComponentMessage>;

type SlotValue<TSlot extends ComponentSlotBase> =
  TSlot['cardinality'] extends 'many'
    ? readonly SlotElement<TSlot>[]
    : TSlot['cardinality'] extends 'optional'
      ? SlotElement<TSlot> | undefined
      : SlotElement<TSlot>;

export type ComponentCallerSlotValues<TSlots extends ComponentSlotShape> = {
  readonly [TName in keyof TSlots as TSlots[TName]['owner'] extends 'caller'
    ? TSlots[TName]['cardinality'] extends 'optional' ? never : TName
    : never]: SlotValue<TSlots[TName]>;
} & {
  readonly [TName in keyof TSlots as TSlots[TName]['owner'] extends 'caller'
    ? TSlots[TName]['cardinality'] extends 'optional' ? TName : never
    : never]?: SlotValue<TSlots[TName]>;
};

export type ComponentImplementationSlotValues<TSlots extends ComponentSlotShape> = {
  readonly [TName in keyof TSlots as TSlots[TName]['owner'] extends 'implementation'
    ? TSlots[TName]['cardinality'] extends 'optional' ? never : TName
    : never]: SlotValue<TSlots[TName]>;
} & {
  readonly [TName in keyof TSlots as TSlots[TName]['owner'] extends 'implementation'
    ? TSlots[TName]['cardinality'] extends 'optional' ? TName : never
    : never]?: SlotValue<TSlots[TName]>;
};

type SlotElementMessage<TValue> = TValue extends readonly ElementValue[]
  ? ElementMessage<TValue[number]>
  : TValue extends ElementValue
    ? ElementMessage<TValue>
    : never;

type BubbledSlotMessages<
  TSlots extends ComponentSlotShape,
  TValues extends Readonly<Record<string, unknown>>
> = {
  [TName in keyof TSlots]: TSlots[TName]['messages'] extends 'bubble'
    ? TName extends keyof TValues
      ? SlotElementMessage<TValues[TName]>
      : never
    : never;
}[keyof TSlots];

export type ComponentMetadataOptions<
  TCapabilities extends readonly ComponentMetadataCapability[],
> = ('focus' extends TCapabilities[number]
  ? { readonly focus?: Pick<ElementFocus, 'disabled' | 'order'> }
  : { readonly focus?: never })
  & ('layer' extends TCapabilities[number] ? { readonly layer?: ElementLayer } : { readonly layer?: never })
  & { readonly accessibleName?: string };

export type ComponentStyleOptions<
  TCapabilities extends readonly ComponentMetadataCapability[],
  TPart extends string,
  TVisualState extends ComponentVisualState,
> = 'styles' extends TCapabilities[number]
  ? { readonly styles?: ElementStyles<TPart, TVisualState> }
  : { readonly styles?: never };

type IdentityOptions<TIdentity extends ComponentIdentity> =
  TIdentity extends 'required'
    ? { readonly id: string }
    : { readonly id?: string };

type StateOptions<TStates extends readonly ComponentStateCapability[]> = Readonly<
  Partial<Pick<Required<ElementState>, TStates[number]>>
>;

type AvailableActionState<TStates extends readonly ComponentStateCapability[]> =
  Omit<StateOptions<TStates>, 'disabled' | 'inert'>
  & ('disabled' extends TStates[number]
      ? { readonly disabled?: boolean }
      : Record<never, never>)
  & ('inert' extends TStates[number]
      ? { readonly inert?: boolean }
      : Record<never, never>);

type UnavailableActionState<TStates extends readonly ComponentStateCapability[]> =
  | ('disabled' extends TStates[number]
      ? Omit<StateOptions<TStates>, 'disabled' | 'inert'> & {
          readonly disabled: true;
          readonly inert?: boolean;
        }
      : never)
  | ('inert' extends TStates[number]
      ? Omit<StateOptions<TStates>, 'disabled' | 'inert'> & {
          readonly inert: true;
          readonly disabled?: boolean;
        }
      : never);

type ActionMapper<TAction, TMessage> = [TAction] extends [never]
  ? { readonly onAction?: never }
  : { readonly onAction: (action: TAction) => MessageResolution<TMessage> };

type StatefulActionOptions<
  TAction,
  TMessage,
  TStates extends readonly ComponentStateCapability[]
> = [TAction] extends [never]
  ? StateOptions<TStates> & { readonly onAction?: never }
  : 'disabled' extends TStates[number]
    ? (UnavailableActionState<TStates> & {
        readonly onAction?: (action: TAction) => MessageResolution<TMessage>;
      })
      | (AvailableActionState<TStates> & {
          readonly onAction: (action: TAction) => MessageResolution<TMessage>;
        })
    : 'inert' extends TStates[number]
      ? (UnavailableActionState<TStates> & {
          readonly onAction?: (action: TAction) => MessageResolution<TMessage>;
        })
        | (AvailableActionState<TStates> & {
            readonly onAction: (action: TAction) => MessageResolution<TMessage>;
          })
    : StateOptions<TStates> & ActionMapper<TAction, TMessage>;

type SemanticInstanceOptions<
  TOptions extends object,
  TAction,
  TMessage,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TVisualState extends ComponentVisualState
> = ComponentOwnOptions<TOptions>
  & StatefulActionOptions<TAction, TMessage, TStates>
  & IdentityOptions<TIdentity>
  & ComponentStyleOptions<TMetadata, TPart, TVisualState>
  & { readonly meta?: ComponentMetadataOptions<TMetadata> };

type DecorativeInstanceOptions<
  TOptions extends object,
  TPart extends string,
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TVisualState extends ComponentVisualState
> = ComponentOwnOptions<TOptions> & IdentityOptions<TIdentity> & ComponentStyleOptions<TMetadata, TPart, TVisualState> & {
  readonly meta?: ComponentMetadataOptions<TMetadata>;
  readonly disabled?: never;
  readonly busy?: never;
  readonly readOnly?: never;
  readonly inert?: never;
  readonly onAction?: never;
};

type SemanticLeafComponent<
  TOptions extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TVisualState extends ComponentVisualState
> = [TAction] extends [never]
  ? (
      options: SemanticInstanceOptions<TOptions, TAction, never, TPart, TStates, TIdentity, TMetadata, TVisualState>
    ) => Element
  : <const TMessage extends ComponentMessage = never>(
      options: SemanticInstanceOptions<TOptions, TAction, TMessage, TPart, TStates, TIdentity, TMetadata, TVisualState>
    ) => Element<TMessage>;

type DecorativeLeafComponent<
  TOptions extends object,
  TPart extends string,
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TVisualState extends ComponentVisualState
> = (
  options: DecorativeInstanceOptions<TOptions, TPart, TIdentity, TMetadata, TVisualState>
) => Element;

type SemanticCompositeComponent<
  TOptions extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotShape,
  TVisualState extends ComponentVisualState
> = [TAction] extends [never]
  ? <const TSlotValues extends ComponentCallerSlotValues<TSlots>>(
      options: SemanticInstanceOptions<TOptions, TAction, never, TPart, TStates, TIdentity, TMetadata, TVisualState>
        & CallerSlotsOption<TSlots, TSlotValues>
    ) => Element<BubbledSlotMessages<TSlots, TSlotValues>>
  : <
      const TSlotValues extends ComponentCallerSlotValues<TSlots>,
      const TMessage extends ComponentMessage = never
    >(
      options: SemanticInstanceOptions<TOptions, TAction, TMessage, TPart, TStates, TIdentity, TMetadata, TVisualState>
        & CallerSlotsOption<TSlots, TSlotValues>
    ) => Element<TMessage | BubbledSlotMessages<TSlots, TSlotValues>>;

/** The exact factory type generated for a semantic painted component. */
export type SemanticLeafComponentFactory<
  TOptions extends object,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = SemanticLeafComponent<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates[number]>;

/** The exact factory type generated for a decorative painted component. */
export type DecorativeLeafComponentFactory<
  TOptions extends object,
  TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = DecorativeLeafComponent<TOptions, TPart, TIdentity, TMetadata, TVisualStates[number]>;

/** The exact factory type generated for a semantic component with named slots. */
export type SemanticCompositeComponentFactory<
  TOptions extends object,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotShape = Readonly<Record<never, never>>,
  TVisualStates extends readonly ComponentVisualState[] = readonly []
> = SemanticCompositeComponent<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates[number]>;

type CallerSlotNames<TSlots extends ComponentSlotShape> = {
  [TName in keyof TSlots]: TSlots[TName]['owner'] extends 'caller' ? TName : never;
}[keyof TSlots];

type RequiredCallerSlotNames<TSlots extends ComponentSlotShape> = {
  [TName in keyof TSlots]: TSlots[TName]['owner'] extends 'caller'
    ? TSlots[TName]['cardinality'] extends 'optional' ? never : TName
    : never;
}[keyof TSlots];

type CallerSlotsOption<
  TSlots extends ComponentSlotShape,
  TValues extends ComponentCallerSlotValues<TSlots>
> = [CallerSlotNames<TSlots>] extends [never]
  ? { readonly slots?: never }
  : [RequiredCallerSlotNames<TSlots>] extends [never]
    ? { readonly slots?: TValues }
    : { readonly slots: TValues };

/** Second stage of `defineComponent<Props, Action>()`; infers model and declared capabilities from the definition. */
export interface StagedComponentFactory<TOptions extends object, TAction> {
  <
    TModel extends object = TOptions,
    const TPart extends string = never,
    const TStates extends readonly ComponentStateCapability[] = readonly [],
    TIdentity extends ComponentIdentity = 'required',
    const TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
    const TVisualStates extends readonly ComponentVisualState[] = readonly [],
  >(
    definition: SemanticLeafComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates>
  ): SemanticLeafComponentFactory<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TVisualStates>;
  <
    TModel extends object = TOptions,
    const TPart extends string = never,
    TIdentity extends ComponentIdentity = 'optional',
    const TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly [],
    const TVisualStates extends readonly ComponentVisualState[] = readonly [],
  >(
    definition: DecorativeLeafComponentDefinition<TOptions, TModel, TPart, TIdentity, TMetadata, TVisualStates>
  ): DecorativeLeafComponentFactory<TOptions, TPart, TIdentity, TMetadata, TVisualStates>;
  <
    TModel extends object = TOptions,
    const TPart extends string = never,
    const TStates extends readonly ComponentStateCapability[] = readonly [],
    TIdentity extends ComponentIdentity = 'required',
    const TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
    const TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>,
    const TVisualStates extends readonly ComponentVisualState[] = readonly [],
  >(
    definition: SemanticCompositeComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates>
      | SemanticComposedComponentDefinition<TOptions, TModel, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates>
  ): SemanticCompositeComponentFactory<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TSlots, TVisualStates>;
}

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

function createDefinedComponentElement<
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
          | import('../accessibility/types.ts').AccessibleRole
          | ((this: undefined, input: ComponentBehaviorInput<TModel>) => import('../accessibility/types.ts').AccessibleRole);
      }
  ),
  behavior: ComponentBehaviorInput<TModel>,
  instanceId: string | undefined,
): import('../accessibility/types.ts').AccessibleRole | undefined {
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

function componentInstanceSlotContent<
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

interface ComponentSlotContent {
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

const emptyComponentSlotContent: ComponentSlotContent = Object.freeze({
  children: Object.freeze([]),
  inspectionChildren: Object.freeze([]),
  ranges: Object.freeze([])
});

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

interface RuntimeComponentSlot {
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

function compileDefinition<
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
  const ownedDefinition = Object.freeze({ ...definition }) as typeof definition;
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
      ]),
      slots: normalizeSlots(definition.slots),
      partSet: new Set(definition.parts ?? []),
      visualStateSet: new Set(definition.visualStates ?? []),
      actionful: definition.semantics === 'semantic' && (
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

function runtimeDefinition<
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
      | import('../accessibility/types.ts').AccessibleRole
      | ((
          this: undefined,
          input: ComponentBehaviorInput<TModel>
        ) => import('../accessibility/types.ts').AccessibleRole);
  },
  behavior: ComponentBehaviorInput<TModel>,
  instanceId: string | undefined,
): import('../accessibility/types.ts').AccessibleRole {
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
