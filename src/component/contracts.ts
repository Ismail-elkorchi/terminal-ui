import type { AccessibleNode } from '../accessibility/types.ts';
import type { ComponentSemanticInspection } from '../element/inspection-contracts.ts';
import type {
  ElementFocus,
  ElementFocusScope,
  ElementKeyBindings,
  ElementLayer,
  ElementState,
  ElementStyles,
} from '../element/metadata.ts';
import type { Element, ElementMessage, ElementValue } from '../element/types.ts';
import type { Rect } from '../geometry/types.ts';
import type {
  FocusLifecycleEvent,
  FocusNavigation,
  FocusTargetLifecycleEvent,
} from '../interaction/focus.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type { PointerInteractionState } from '../interaction/pointer-interaction.ts';
import type {
  ComponentRenderTarget,
  FocusTarget,
  FrameSourceInput,
  HitTarget,
  Measurement,
  RenderFocusRelation,
  RenderPreparationContext,
  RenderStyleInput,
} from '../renderer/contracts.ts';
import type { TextWidthProfile } from '../text/types.ts';
import type { TerminalTheme } from '../theme/theme.ts';
import type { ElementVisualState, FrameCellSource } from '../visual/frame-source.ts';
import type { TerminalStyle } from '../visual/render-content.ts';
import { type ComponentDefinitionName } from './execution-error.ts';
import { type ComponentMessage } from './message.ts';


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

export interface ComponentBehaviorInput<TModel extends object> {
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
  /** Canonical caller styles, available for explicit component-local cache dependencies. */
  readonly styles?: ElementStyles<TPart, ComponentVisualState>;
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

/** Geometry of an accepted frame, delivered after publication rather than during layout. */
export interface ComponentLayoutCommitInput<TModel extends object> extends ComponentInput<TModel> {
  readonly commitId: string;
  readonly allocatedBounds: Rect;
  readonly previous?: ComponentInput<TModel> & { readonly allocatedBounds: Rect };
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

export interface ComponentDefinitionIdentity {
  /** A package-qualified identity such as `acme/widgets/badge`. */
  readonly name: ComponentDefinitionName;
}

/** Optional preparation may warm model-owned caches; rendering must also work without it. */
export interface ComponentPreparationInput<TModel extends object> extends RenderPreparationContext {
  readonly id?: string;
  readonly model: Readonly<TModel>;
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

export type ComponentOptionsDefinition<
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
  readonly prepare?: (this: undefined, input: ComponentPreparationInput<TModel>) => Promise<void>;
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
  readonly onLayout?: (this: undefined, input: ComponentLayoutCommitInput<TModel>) => MessageResolution<TAction>;
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
  readonly onLayout?: never;
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
    /** Opt in only when paint depends exclusively on its immutable render input. */
    readonly retainPaint?: boolean;
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
    /** Opt in only when paint depends exclusively on its immutable render input. */
    readonly retainPaint?: boolean;
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TModel, TPart>
    ) => undefined;
  };

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

export type ComponentReservedOption =
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
