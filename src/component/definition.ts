import type { AccessibleNode } from '../accessibility/index.ts';
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
  ElementStyles
} from '../element/metadata.ts';
import { elementStateFields } from '../element/metadata.ts';
import { renderNodeId } from '../foundation/identity.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isStringMember
} from '../foundation/validation.ts';
import type { Rect } from '../geometry/types.ts';
import type {
  MessageResolution,
  PointerInteractionAction,
  PointerInteractionOptions,
  PointerInteractionState
} from '../interaction/index.ts';
import {
  componentElementFromRenderNode,
  markImplementationStructure,
  mapElementMessages,
  resolveRenderNodeStyle,
  renderNodeInteraction,
  toRenderNode,
  toMappedRenderNodes,
  toRenderNodes
} from '../renderer/model/component-node.ts';
import type {
  RenderNode,
  RenderNodeOfKind,
  RenderNodeRenderer,
  RuntimeComponentDefinition
} from '../renderer/model/component-node.ts';
import type {
  FocusTarget,
  HitTarget,
  Measurement,
  RenderFocusRelation,
  RenderSourceInput,
  RenderStyleInput,
  RenderTarget
} from '../renderer/contracts.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalStyle } from '../visual/render.ts';
import type { FrameCellSource } from '../visual/source.ts';
import { normalizeTerminalStyle } from '../visual/terminal-style.ts';
import { renderNodeFrameSource } from '../visual/source.ts';
import {
  executeComponentPhase,
  type ComponentDefinitionName
} from './execution-error.ts';
import { immutablePreparedModel } from './prepared-model.ts';
import { mapComponentAction, type ComponentMessage } from './message.ts';
import {
  actionMapper,
  assertPointerDefinition,
  mapHitTargets,
  mappedKeyBindings,
  normalizedPointerState
} from './action-routing.ts';

export {
  ComponentExecutionError,
  type ComponentDefinitionName,
  type ComponentExecutionPhase
} from './execution-error.ts';
export type { ComponentMessage } from './message.ts';

export type ComponentStyleInput<TPart extends string> = RenderStyleInput<TPart>;
export type ComponentSourceInput = RenderSourceInput;
export type ComponentStateCapability = keyof ElementState;
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

interface ComponentBehaviorInput<TPrepared extends object> {
  readonly id?: string;
  readonly model: Readonly<TPrepared>;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly inert: boolean;
}

interface ComponentBaseInput<TPrepared extends object>
  extends ComponentBehaviorInput<TPrepared> {
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface ComponentInput<TPrepared extends object>
  extends ComponentBaseInput<TPrepared> {
  readonly bounds: Rect;
  readonly viewport: Rect;
}

export interface ComponentInteractionInput<
  TPrepared extends object,
  TPart extends string = string
> extends ComponentInput<TPrepared> {
  readonly style: (input: ComponentStyleInput<TPart>) => TerminalStyle | undefined;
  readonly source: (input?: ComponentSourceInput) => FrameCellSource;
}

export interface ComponentMeasureInput<
  TPrepared extends object,
  TSlots extends ComponentSlotShape = ComponentSlotShape
>
  extends ComponentBaseInput<TPrepared> {
  readonly constraints: ComponentMeasureConstraints;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly slots: ComponentSlotMeasurements<TSlots>;
}

export interface ComponentLayoutInput<
  TPrepared extends object,
  TSlots extends ComponentSlotShape = ComponentSlotShape
>
  extends ComponentInput<TPrepared> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly slots: ComponentSlotMeasurements<TSlots>;
}

export interface ComponentCompositionInput<
  TPrepared extends object,
  TSlots extends ComponentSlotShape,
  TAction,
  TPart extends string = string
> extends ComponentBehaviorInput<TPrepared> {
  readonly slots: ComponentCallerSlotValues<TSlots>;
  readonly emit: (action: TAction) => MessageResolution<ComponentMessage>;
  readonly styles?: ElementStyles<TPart>;
  readonly layer?: ElementLayer;
}

export interface ComponentCapturedMessageInput<TPrepared extends object>
  extends ComponentBehaviorInput<TPrepared> {
  readonly slot: string;
  readonly message: unknown;
}

export interface ComponentRenderInput<
  TPrepared extends object,
  TPart extends string = string
> extends ComponentInteractionInput<TPrepared, TPart> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
}

export interface ComponentAccessibilityInput<
  TPrepared extends object,
  TSlots extends ComponentSlotShape = ComponentSlotShape
>
  extends ComponentInput<TPrepared> {
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

export interface ComponentTextActionInput<TPrepared extends object>
  extends ComponentBehaviorInput<TPrepared> {
  readonly text: string;
}

export interface ComponentPointerActions<
  TPrepared extends object,
  TAction
> {
  readonly state?: (
    this: undefined,
    input: ComponentBehaviorInput<TPrepared>
  ) => PointerInteractionState | undefined;
  readonly onAction: (
    this: undefined,
    action: PointerInteractionAction,
    input: ComponentBehaviorInput<TPrepared>
  ) => MessageResolution<TAction>;
}

type NoComponentOptions = Readonly<Record<never, never>>;

interface ComponentDefinitionIdentity {
  /** A package-qualified identity such as `acme/widgets/badge`. */
  readonly name: ComponentDefinitionName;
}

interface EmptyComponentOptionsDefinition {
  readonly optionFields?: never;
  readonly prepare?: never;
}

interface PreparedComponentOptionsDefinition<
  TOptions extends object,
  TPrepared extends object
> {
  readonly optionFields: Readonly<Record<Extract<keyof TOptions, string>, null>>;
  readonly prepare: (
    this: undefined,
    value: unknown,
    context: ComponentPreparationContext
  ) => TPrepared;
}

export interface ComponentPreparationContext {
  readonly id?: string;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly inert: boolean;
}

type ComponentOptionsDefinition<
  TOptions extends object,
  TPrepared extends object
> =
  keyof TOptions extends never
    ? EmptyComponentOptionsDefinition | PreparedComponentOptionsDefinition<TOptions, TPrepared>
    : PreparedComponentOptionsDefinition<TOptions, TPrepared>;

type ComponentDefinitionBase<
  TOptions extends object,
  TPrepared extends object,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TPart extends string
> = ComponentDefinitionIdentity & ComponentOptionsDefinition<TOptions, TPrepared> & {
  readonly identity: TIdentity;
  readonly states?: TStates;
  readonly parts?: readonly TPart[];
  readonly layer?: (
    this: undefined,
    input: ComponentBehaviorInput<TPrepared>
  ) => ElementLayer | undefined;
};

interface MeasuredComponentDefinition<
  TPrepared extends object,
  TSlots extends ComponentSlotShape
> {
  readonly measure: (
    this: undefined,
    input: ComponentMeasureInput<TPrepared, TSlots>
  ) => Measurement;
}

interface InteractiveDefinition<TPrepared extends object, TAction, TPart extends string> {
  /** Prevents raw text events from being recorded while this component owns focus. */
  readonly sensitiveInput?: boolean;
  readonly focusTargets?: (
    this: undefined,
    input: ComponentInteractionInput<TPrepared, TPart>
  ) => readonly FocusTarget[];
  readonly hitTargets?: (
    this: undefined,
    input: ComponentInteractionInput<TPrepared, TPart>
  ) => readonly HitTarget<TAction>[];
  readonly keys?: (
    this: undefined,
    input: ComponentBehaviorInput<TPrepared>
  ) => ElementKeyBindings<TAction>;
  readonly onInput?: (
    this: undefined,
    input: ComponentTextActionInput<TPrepared>
  ) => MessageResolution<TAction>;
  readonly onPaste?: (
    this: undefined,
    input: ComponentTextActionInput<TPrepared>
  ) => MessageResolution<TAction>;
  readonly pointer?: ComponentPointerActions<TPrepared, TAction>;
}

interface SemanticDefinition<
  TPrepared extends object,
  TAction,
  TSlots extends ComponentSlotShape,
  TPart extends string
>
  extends InteractiveDefinition<TPrepared, TAction, TPart> {
  readonly semantics: 'semantic';
  readonly focusScope?: (
    this: undefined,
    input: ComponentBehaviorInput<TPrepared>
  ) => ElementFocusScope | undefined;
  readonly accessibility: (
    this: undefined,
    input: ComponentAccessibilityInput<TPrepared, TSlots>
  ) => AccessibleNode;
}

interface DecorativeDefinition {
  readonly semantics: 'decorative';
  readonly accessibility?: never;
  readonly focusTargets?: never;
  readonly hitTargets?: never;
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly pointer?: never;
  readonly sensitiveInput?: never;
}

export type ComponentMetadataCapability = 'focus' | 'layer' | 'styles';

export type SemanticLeafComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly []
> = ComponentDefinitionBase<
  TOptions,
  TPrepared,
  TStates,
  TIdentity,
  TPart
> & MeasuredComponentDefinition<TPrepared, Readonly<Record<never, never>>>
  & SemanticDefinition<TPrepared, TAction, Readonly<Record<never, never>>, TPart>
  & {
    readonly metadata?: TMetadata;
    readonly slots?: never;
    readonly structure: 'leaf';
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TPrepared, TPart>
    ) => void;
  };

export type DecorativeLeafComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly []
> = ComponentDefinitionBase<
  TOptions,
  TPrepared,
  readonly [],
  TIdentity,
  TPart
> & MeasuredComponentDefinition<TPrepared, Readonly<Record<never, never>>>
  & DecorativeDefinition
  & {
    readonly metadata?: TMetadata;
    readonly slots?: never;
    readonly structure: 'leaf';
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TPrepared, TPart>
    ) => void;
  };

export type SemanticCompositeComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>
> = ComponentDefinitionBase<TOptions, TPrepared, TStates, TIdentity, TPart>
  & MeasuredComponentDefinition<TPrepared, TSlots>
  & SemanticDefinition<TPrepared, TAction, TSlots, TPart>
  & {
    readonly metadata?: TMetadata;
    readonly slots: TSlots;
    readonly structure: 'composite';
    readonly capture?: (
      this: undefined,
      input: ComponentCapturedMessageInput<TPrepared>
    ) => MessageResolution<TAction>;
    readonly implementationSlots?: (
      this: undefined,
      input: ComponentCompositionInput<TPrepared, TSlots, TAction, TPart>
    ) => ComponentImplementationSlotValues<TSlots>;
    readonly clipChildren?: boolean;
    readonly layout: (
      this: undefined,
      input: ComponentLayoutInput<TPrepared, TSlots>
    ) => ComponentSlotLayout<TSlots>;
    readonly renderBeforeChildren?: (
      this: undefined,
      input: ComponentRenderInput<TPrepared, TPart>
    ) => void;
    readonly renderAfterChildren?: (
      this: undefined,
      input: ComponentRenderInput<TPrepared, TPart>
    ) => void;
  };

export type SemanticComposedComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>
> = ComponentDefinitionBase<TOptions, TPrepared, TStates, TIdentity, TPart>
  & SemanticDefinition<TPrepared, TAction, TSlots, TPart>
  & {
    readonly metadata?: TMetadata;
    readonly slots?: TSlots;
    readonly structure: 'composed';
    readonly capture?: (
      this: undefined,
      input: ComponentCapturedMessageInput<TPrepared>
    ) => MessageResolution<TAction>;
    readonly compose: (
      this: undefined,
      input: ComponentCompositionInput<TPrepared, TSlots, TAction, TPart>
    ) => Element<ComponentMessage>;
    readonly clipChildren?: boolean;
  };

export type ComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>
> =
  | SemanticLeafComponentDefinition<TOptions, TPrepared, TAction, TPart, TStates, TIdentity, TMetadata>
  | DecorativeLeafComponentDefinition<TOptions, TPrepared, TPart, TIdentity, Extract<TMetadata, readonly ('layer' | 'styles')[]>>
  | SemanticCompositeComponentDefinition<TOptions, TPrepared, TAction, TPart, TStates, TIdentity, TMetadata, TSlots>
  | SemanticComposedComponentDefinition<TOptions, TPrepared, TAction, TPart, TStates, TIdentity, TMetadata, TSlots>;

type ComponentReservedOption =
  | 'id'
  | 'children'
  | 'slots'
  | ComponentStateCapability
  | 'onAction'
  | 'meta'
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
  TPart extends string
> = ('focus' extends TCapabilities[number]
  ? { readonly focus?: Pick<ElementFocus, 'disabled' | 'order'> }
  : { readonly focus?: never })
  & ('layer' extends TCapabilities[number] ? { readonly layer?: ElementLayer } : { readonly layer?: never })
  & ('styles' extends TCapabilities[number] ? { readonly styles?: ElementStyles<TPart> } : { readonly styles?: never });

type IdentityOptions<TIdentity extends ComponentIdentity> =
  TIdentity extends 'required'
    ? { readonly id: string }
    : { readonly id?: string };

type StateOptions<TStates extends readonly ComponentStateCapability[]> = Readonly<
  Partial<Pick<Required<ElementState>, TStates[number]>>
>;

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
    ? Omit<StateOptions<TStates>, 'disabled'> & (
        | { readonly disabled: true; readonly onAction?: never }
        | { readonly disabled?: false; readonly onAction: (action: TAction) => MessageResolution<TMessage> }
      )
    : StateOptions<TStates> & ActionMapper<TAction, TMessage>;

type SemanticInstanceOptions<
  TOptions extends object,
  TAction,
  TMessage,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[]
> = ComponentOwnOptions<TOptions>
  & StatefulActionOptions<TAction, TMessage, TStates>
  & IdentityOptions<TIdentity>
  & { readonly meta?: ComponentMetadataOptions<TMetadata, TPart> };

type DecorativeInstanceOptions<
  TOptions extends object,
  TPart extends string,
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[]
> = ComponentOwnOptions<TOptions> & IdentityOptions<TIdentity> & {
  readonly meta?: ComponentMetadataOptions<TMetadata, TPart>;
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
  TMetadata extends readonly ComponentMetadataCapability[]
> = [TAction] extends [never]
  ? (
      options: SemanticInstanceOptions<TOptions, TAction, never, TPart, TStates, TIdentity, TMetadata>
    ) => Element
  : <const TMessage extends ComponentMessage = never>(
      options: SemanticInstanceOptions<TOptions, TAction, TMessage, TPart, TStates, TIdentity, TMetadata>
    ) => Element<TMessage>;

type DecorativeLeafComponent<
  TOptions extends object,
  TPart extends string,
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[]
> = (
  options: DecorativeInstanceOptions<TOptions, TPart, TIdentity, TMetadata>
) => Element;

type SemanticCompositeComponent<
  TOptions extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotShape
> = [TAction] extends [never]
  ? <const TSlotValues extends ComponentCallerSlotValues<TSlots>>(
      options: SemanticInstanceOptions<TOptions, TAction, never, TPart, TStates, TIdentity, TMetadata>
        & CallerSlotsOption<TSlots, TSlotValues>
    ) => Element<BubbledSlotMessages<TSlots, TSlotValues>>
  : <
      const TSlotValues extends ComponentCallerSlotValues<TSlots>,
      const TMessage extends ComponentMessage = never
    >(
      options: SemanticInstanceOptions<TOptions, TAction, TMessage, TPart, TStates, TIdentity, TMetadata>
        & CallerSlotsOption<TSlots, TSlotValues>
    ) => Element<TMessage | BubbledSlotMessages<TSlots, TSlotValues>>;

/** The exact factory type generated for a semantic painted component. */
export type SemanticLeafComponentFactory<
  TOptions extends object,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly []
> = SemanticLeafComponent<TOptions, TAction, TPart, TStates, TIdentity, TMetadata>;

/** The exact factory type generated for a decorative painted component. */
export type DecorativeLeafComponentFactory<
  TOptions extends object,
  TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly []
> = DecorativeLeafComponent<TOptions, TPart, TIdentity, TMetadata>;

/** The exact factory type generated for a semantic component with named slots. */
export type SemanticCompositeComponentFactory<
  TOptions extends object,
  TAction = never,
  TPart extends string = never,
  TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  TSlots extends ComponentSlotShape = Readonly<Record<never, never>>
> = SemanticCompositeComponent<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TSlots>;

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

export function defineComponent<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TAction = never,
  const TPart extends string = never,
  const TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  const TMetadata extends readonly ComponentMetadataCapability[] = readonly []
>(
  definition: SemanticLeafComponentDefinition<TOptions, TPrepared, TAction, TPart, TStates, TIdentity, TMetadata>
): SemanticLeafComponent<TOptions, TAction, TPart, TStates, TIdentity, TMetadata>;
export function defineComponent<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  const TPart extends string = never,
  TIdentity extends ComponentIdentity = 'optional',
  const TMetadata extends readonly Extract<ComponentMetadataCapability, 'layer' | 'styles'>[] = readonly []
>(
  definition: DecorativeLeafComponentDefinition<TOptions, TPrepared, TPart, TIdentity, TMetadata>
): DecorativeLeafComponent<TOptions, TPart, TIdentity, TMetadata>;
export function defineComponent<
  TOptions extends object = NoComponentOptions,
  TPrepared extends object = TOptions,
  TAction = never,
  const TPart extends string = never,
  const TStates extends readonly ComponentStateCapability[] = readonly [],
  TIdentity extends ComponentIdentity = 'required',
  const TMetadata extends readonly ComponentMetadataCapability[] = readonly [],
  const TSlots extends ComponentSlotsDefinition = Readonly<Record<never, never>>
>(
  definition: SemanticCompositeComponentDefinition<
    TOptions,
    TPrepared,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TSlots
  > | SemanticComposedComponentDefinition<
    TOptions,
    TPrepared,
    TAction,
    TPart,
    TStates,
    TIdentity,
    TMetadata,
    TSlots
  >
): SemanticCompositeComponent<TOptions, TAction, TPart, TStates, TIdentity, TMetadata, TSlots>;
export function defineComponent(
  definition: unknown
): unknown {
  assertDefinition(definition);
  const normalized = normalizeDefinition(definition);
  const runtime = runtimeDefinition(normalized);
  const component = (value: unknown): Element<unknown> => {
    assertComponentInstanceOptions(value, normalized);
    const state = normalized.semantics === 'decorative'
      ? emptyComponentState
      : normalizeComponentState(value, normalized.states);
    const prepared = prepareComponentOptions(value, normalized, state);
    const toActionMessage = value.onAction;
    const behavior = componentBehaviorInput(value.id, prepared, state);
    const requiredLayer = componentDefinitionLayer(value.id, normalized, behavior);
    const meta = componentInstanceMeta(value, normalized, behavior, requiredLayer);
    const slotContent = normalized.structure === 'composite' || normalized.structure === 'composed'
      ? componentSlotChildren(
          value,
          normalized,
          behavior,
          toActionMessage,
          meta.styles,
          normalized.structure === 'composed' && requiredLayer !== undefined
            ? Object.freeze({ ...value.meta?.layer, ...requiredLayer })
            : undefined
        )
      : emptySlotContent;
    const children = normalized.structure === 'composite' || normalized.structure === 'composed'
      ? slotContent.children
      : undefined;
    const renderNode: RenderNodeOfKind<unknown, 'component'> = {
      ...(value.id === undefined ? {} : { id: renderNodeId(value.id, normalized.name) }),
      kind: 'component',
      props: {
        options: prepared,
        slots: slotContent.ranges,
        ...(toActionMessage === undefined ? {} : { toActionMessage })
      },
      definition: runtime,
      ...(Object.keys(state).length === 0 ? {} : { state }),
      ...(children === undefined ? {} : { children }),
      ...(normalized.structure === 'leaf'
        ? {}
        : { inspectionChildren: slotContent.inspectionChildren }),
      ...renderNodeInteraction({
        keys: normalized.semantics === 'semantic'
          ? mappedKeyBindings(
              normalized.keys === undefined
                ? undefined
                : executeComponentPhase(normalized.name, value.id, 'keyboard', () =>
                    normalized.keys?.call(undefined, behavior)
                  ),
              toActionMessage,
              normalized.name,
              value.id
            )
          : undefined,
        onInput: normalized.semantics === 'semantic' && normalized.onInput !== undefined
          ? (text: string) => executeComponentPhase(normalized.name, value.id, 'input', () =>
              mapComponentAction(
                normalized.onInput?.call(undefined, { ...behavior, text }),
                toActionMessage
              )
            )
          : undefined,
        onPaste: normalized.semantics === 'semantic' && normalized.onPaste !== undefined
          ? (text: string) => executeComponentPhase(normalized.name, value.id, 'paste', () =>
              mapComponentAction(
                normalized.onPaste?.call(undefined, { ...behavior, text }),
                toActionMessage
              )
            )
          : undefined,
        pointer: componentPointerInteraction(normalized, behavior, toActionMessage, value.id),
        meta
      })
    };
    return componentElementFromRenderNode<'component', unknown>(renderNode);
  };
  return Object.freeze(component);
}

interface ComponentInstanceOptions extends Record<string, unknown> {
  readonly id?: string;
  readonly slots?: Readonly<Record<string, unknown>>;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly readOnly?: boolean;
  readonly inert?: boolean;
  readonly onAction?: (action: unknown) => unknown;
  readonly meta?: {
    readonly focus?: ElementFocus;
    readonly layer?: ElementLayer;
    readonly styles?: ElementStyles;
  };
}

interface PreparedSlotContent {
  readonly children: readonly RenderNode[];
  readonly inspectionChildren: readonly RenderNode[];
  readonly ranges: readonly ComponentSlotRange[];
}

interface ComponentSlotRange {
  readonly name: string;
  readonly start: number;
  readonly count: number;
  readonly accessiblePaths: readonly (readonly number[])[];
}

const emptySlotContent: PreparedSlotContent = Object.freeze({
  children: Object.freeze([]),
  inspectionChildren: Object.freeze([]),
  ranges: Object.freeze([])
});

interface NormalizedDefinitionBase {
  readonly name: ComponentDefinitionName;
  readonly identity: ComponentIdentity;
  readonly states: readonly ComponentStateCapability[];
  readonly metadata: readonly ComponentMetadataCapability[];
  readonly slots: readonly NormalizedSlot[];
  readonly parts: readonly string[];
  readonly partSet: ReadonlySet<string>;
  readonly optionFields: readonly string[];
  readonly prepare?: (
    this: undefined,
    value: unknown,
    context: ComponentPreparationContext
  ) => Readonly<Record<string, unknown>>;
  readonly layer?: (
    this: undefined,
    input: ComponentBehaviorInput<Readonly<Record<string, unknown>>>
  ) => ElementLayer | undefined;
}

interface NormalizedMeasuredDefinition {
  readonly measure: (
    this: undefined,
    input: ComponentMeasureInput<Readonly<Record<string, unknown>>>
  ) => Measurement;
}

interface NormalizedSlot {
  readonly name: string;
  readonly cardinality: ComponentSlotCardinality;
  readonly owner: ComponentSlotOwner;
  readonly messages: ComponentSlotMessagePolicy;
}

interface NormalizedSemanticDefinition extends NormalizedDefinitionBase {
  readonly semantics: 'semantic';
  readonly sensitiveInput: boolean;
  readonly accessibility: (
    this: undefined,
    input: ComponentAccessibilityInput<Readonly<Record<string, unknown>>>
  ) => AccessibleNode;
  readonly focusScope?: (
    this: undefined,
    input: ComponentBehaviorInput<Readonly<Record<string, unknown>>>
  ) => ElementFocusScope | undefined;
  readonly focusTargets?: (
    this: undefined,
    input: ComponentInteractionInput<Readonly<Record<string, unknown>>>
  ) => readonly FocusTarget[];
  readonly hitTargets?: (
    this: undefined,
    input: ComponentInteractionInput<Readonly<Record<string, unknown>>>
  ) => readonly HitTarget[];
  readonly keys?: (
    this: undefined,
    input: ComponentBehaviorInput<Readonly<Record<string, unknown>>>
  ) => ElementKeyBindings<unknown>;
  readonly onInput?: (
    this: undefined,
    input: ComponentTextActionInput<Readonly<Record<string, unknown>>>
  ) => MessageResolution<unknown>;
  readonly onPaste?: (
    this: undefined,
    input: ComponentTextActionInput<Readonly<Record<string, unknown>>>
  ) => MessageResolution<unknown>;
  readonly pointer?: ComponentPointerActions<Readonly<Record<string, unknown>>, unknown>;
}

type NormalizedDefinition =
  | (NormalizedDefinitionBase & NormalizedMeasuredDefinition & {
      readonly semantics: 'decorative';
      readonly structure: 'leaf';
      readonly render: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
    })
  | (NormalizedSemanticDefinition & NormalizedMeasuredDefinition & {
      readonly structure: 'leaf';
      readonly render: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
    })
  | (NormalizedSemanticDefinition & NormalizedMeasuredDefinition & {
      readonly structure: 'composite';
      readonly clipChildren?: boolean;
      readonly capture?: (
        this: undefined,
        input: ComponentCapturedMessageInput<Readonly<Record<string, unknown>>>
      ) => MessageResolution<unknown>;
      readonly implementationSlots?: (
        this: undefined,
        input: ComponentCompositionInput<
          Readonly<Record<string, unknown>>,
          ComponentSlotsDefinition,
          unknown
        >
      ) => Readonly<Record<string, unknown>>;
      readonly layout: (
        this: undefined,
        input: ComponentLayoutInput<Readonly<Record<string, unknown>>>
      ) => unknown;
      readonly renderBeforeChildren?: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
      readonly renderAfterChildren?: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
    })
  | (NormalizedSemanticDefinition & {
      readonly structure: 'composed';
      readonly clipChildren?: boolean;
      readonly capture?: (
        this: undefined,
        input: ComponentCapturedMessageInput<Readonly<Record<string, unknown>>>
      ) => MessageResolution<unknown>;
      readonly compose: (
        this: undefined,
        input: ComponentCompositionInput<
          Readonly<Record<string, unknown>>,
          ComponentSlotsDefinition,
          unknown
        >
      ) => Element<ComponentMessage>;
    });

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
  'keys',
  'onInput',
  'onPaste',
  'pointer'
]);

function normalizeDefinition(
  definition: ComponentDefinition<
    NoComponentOptions,
    Readonly<Record<string, unknown>>,
    unknown,
    string,
    readonly ComponentStateCapability[],
    ComponentIdentity,
    readonly ComponentMetadataCapability[],
    ComponentSlotsDefinition
  >
): NormalizedDefinition {
  const common = {
    name: definition.name,
    identity: definition.identity,
    states: Object.freeze([...(definition.states ?? [])]),
    metadata: Object.freeze([...(definition.metadata ?? [])]),
    slots: normalizeSlots(definition.slots),
    parts: Object.freeze([...(definition.parts ?? [])]),
    partSet: new Set(definition.parts ?? []),
    optionFields: Object.freeze(Object.keys(definition.optionFields ?? {})),
    ...(definition.layer === undefined ? {} : { layer: definition.layer }),
    ...(definition.prepare === undefined ? {} : { prepare: definition.prepare })
  };
  if (definition.semantics === 'decorative') {
    return Object.freeze({
      ...common,
      structure: 'leaf' as const,
      semantics: 'decorative' as const,
      measure: definition.measure,
      render: definition.render
    });
  }
  const interaction = {
    accessibility: definition.accessibility,
    sensitiveInput: definition.sensitiveInput === true,
    ...(definition.focusScope === undefined ? {} : { focusScope: definition.focusScope }),
    ...(definition.focusTargets === undefined ? {} : { focusTargets: definition.focusTargets }),
    ...(definition.hitTargets === undefined ? {} : { hitTargets: definition.hitTargets }),
    ...(definition.keys === undefined ? {} : { keys: definition.keys }),
    ...(definition.onInput === undefined ? {} : { onInput: definition.onInput }),
    ...(definition.onPaste === undefined ? {} : { onPaste: definition.onPaste }),
    ...(definition.pointer === undefined ? {} : { pointer: definition.pointer })
  };
  if (definition.structure === 'leaf') {
    return Object.freeze({
      ...common,
      structure: 'leaf' as const,
      semantics: 'semantic' as const,
      ...interaction,
      measure: definition.measure,
      render: definition.render
    });
  }
  if (definition.structure === 'composed') {
    return Object.freeze({
      ...common,
      structure: 'composed' as const,
      semantics: 'semantic' as const,
      ...interaction,
      ...(definition.clipChildren === undefined ? {} : { clipChildren: definition.clipChildren }),
      ...(definition.capture === undefined ? {} : { capture: definition.capture }),
      compose: definition.compose
    });
  }
  return Object.freeze({
    ...common,
    structure: 'composite' as const,
    semantics: 'semantic' as const,
    ...interaction,
    ...(definition.clipChildren === undefined ? {} : { clipChildren: definition.clipChildren }),
    ...(definition.capture === undefined ? {} : { capture: definition.capture }),
    ...(definition.implementationSlots === undefined
      ? {}
      : { implementationSlots: definition.implementationSlots }),
    measure: definition.measure,
    layout: definition.layout,
    ...(definition.renderBeforeChildren === undefined ? {} : { renderBeforeChildren: definition.renderBeforeChildren }),
    ...(definition.renderAfterChildren === undefined ? {} : { renderAfterChildren: definition.renderAfterChildren })
  });
}

function normalizeSlots(
  value: ComponentSlotsDefinition | Readonly<Record<never, never>> | undefined
): readonly NormalizedSlot[] {
  if (value === undefined) return Object.freeze([]);
  return Object.freeze(Object.entries(value).map(([name, slot]) => Object.freeze({
    name,
    cardinality: slot.cardinality,
    owner: slot.owner,
    messages: slot.messages
  })));
}

function assertSlotDefinitions(value: unknown, structure: 'leaf' | 'composite' | 'composed'): void {
  if (value === undefined) return;
  if (structure === 'leaf') throw new TypeError('Only composite or composed components can declare slots.');
  if (!isNonArrayObject(value)) throw new TypeError('Component definition slots must be an object.');
  for (const [name, slot] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(name)) {
      throw new TypeError(`Component slot name "${name}" is invalid.`);
    }
    if (!isNonArrayObject(slot)) throw new TypeError(`Component slot "${name}" must be an object.`);
    const owner = slot['owner'];
    const allowed = new Set(['cardinality', 'owner', 'messages']);
    const unsupported = findUnsupportedField(slot, allowed);
    if (unsupported !== undefined) {
      throw new TypeError(`Component slot "${name}" contains unknown field "${unsupported}".`);
    }
    if (slot['cardinality'] !== 'one'
      && slot['cardinality'] !== 'optional'
      && slot['cardinality'] !== 'many') {
      throw new TypeError(`Component slot "${name}" cardinality is invalid.`);
    }
    if (owner !== 'caller' && owner !== 'implementation') {
      throw new TypeError(`Component slot "${name}" owner is invalid.`);
    }
    if (slot['messages'] !== 'bubble' && slot['messages'] !== 'capture' && slot['messages'] !== 'none') {
      throw new TypeError(`Component slot "${name}" message policy is invalid.`);
    }
  }
}

function assertDefinition(
  value: unknown
): asserts value is ComponentDefinition<
  NoComponentOptions,
  Readonly<Record<string, unknown>>,
  unknown,
  string,
    readonly ComponentStateCapability[],
    ComponentIdentity,
    readonly ComponentMetadataCapability[],
    ComponentSlotsDefinition
  > {
  if (!isNonArrayObject(value)) throw new TypeError('Component definition must be an object.');
  const structure = value['structure'];
  const semantics = value['semantics'];
  if (structure !== 'leaf' && structure !== 'composite' && structure !== 'composed') {
    throw new TypeError('Component definition structure must be "leaf", "composite", or "composed".');
  }
  if (semantics !== 'semantic' && semantics !== 'decorative') {
    throw new TypeError('Component definition semantics must be "semantic" or "decorative".');
  }
  if (structure !== 'leaf' && semantics === 'decorative') {
    throw new TypeError('Decorative component definitions must be leaf components.');
  }
  if (typeof value['name'] !== 'string' || !isQualifiedComponentName(value['name'])) {
    throw new TypeError('Component name must be a safe package-qualified identifier such as "acme/widgets/badge".');
  }
  const parts = value['parts'];
  if (parts !== undefined && (!Array.isArray(parts)
    || parts.some((part) => typeof part !== 'string'
      || !/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(part)
      || part === 'root')
    || new Set(parts).size !== parts.length)) {
    throw new TypeError('Component parts must contain unique safe identifiers other than "root".');
  }
  const allowed = new Set([
    'name',
    'identity',
    'states',
    'slots',
    'metadata',
    'parts',
    'layer',
    'optionFields',
    'prepare',
    'structure',
    'semantics',
    'measure',
    ...(structure === 'leaf'
      ? ['measure', 'render']
      : structure === 'composite'
        ? ['measure', 'layout', 'clipChildren', 'capture', 'implementationSlots', 'renderBeforeChildren', 'renderAfterChildren']
        : ['compose', 'clipChildren', 'capture']),
    ...(semantics === 'semantic'
      ? ['accessibility', 'focusScope', 'focusTargets', 'hitTargets', 'keys', 'onInput', 'onPaste', 'pointer', 'sensitiveInput']
      : [])
  ]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) throw new TypeError(`Component definition contains unknown field "${unknown}".`);
  if (value['identity'] !== 'required' && value['identity'] !== 'optional') {
    throw new TypeError('Component definition identity must be "required" or "optional".');
  }
  assertUniqueStringMembers(value['states'], elementStateFields, 'Component definition states');
  assertUniqueStringMembers(
    value['metadata'],
    ['focus', 'layer', 'styles'],
    'Component definition metadata'
  );
  assertSlotDefinitions(value['slots'], structure);
  if (structure === 'composite'
    && (!isNonArrayObject(value['slots']) || Object.keys(value['slots']).length === 0)) {
    throw new TypeError('Composite component definitions require at least one named slot.');
  }
  const hasCapturedSlot = isNonArrayObject(value['slots'])
    && Object.values(value['slots']).some((slot) => isNonArrayObject(slot) && slot['messages'] === 'capture');
  if (hasCapturedSlot !== (value['capture'] !== undefined)) {
    throw new TypeError('Component definition capture must be declared exactly when a slot captures messages.');
  }
  const hasImplementationSlot = isNonArrayObject(value['slots'])
    && Object.values(value['slots']).some((slot) => isNonArrayObject(slot) && slot['owner'] === 'implementation');
  if (structure === 'composed' && hasImplementationSlot) {
    throw new TypeError('Composed component slots must be caller-owned; compose() owns its implementation tree.');
  }
  if (structure !== 'composed' && hasImplementationSlot !== (value['implementationSlots'] !== undefined)) {
    throw new TypeError(
      'Component definition implementationSlots must be declared exactly when a slot is implementation-owned.'
    );
  }
  const optionFields = value['optionFields'];
  if (optionFields !== undefined && (!isNonArrayObject(optionFields)
    || Object.entries(optionFields).some(([field, included]) =>
      field.length === 0
      || componentInstanceFields.has(field as ComponentReservedOption)
      || included !== null))) {
    throw new TypeError('Component definition optionFields must map every non-reserved option field to null.');
  }
  if ((optionFields === undefined) !== (value['prepare'] === undefined)) {
    throw new TypeError('Component definition optionFields and prepare must be declared together.');
  }
  const requiredHooks = structure === 'leaf'
    ? ['measure', 'render']
    : structure === 'composite'
      ? ['measure', 'layout']
      : ['compose'];
  for (const hook of requiredHooks) {
    if (typeof value[hook] !== 'function') throw new TypeError(`Component definition requires ${hook}().`);
  }
  if (value['prepare'] !== undefined && typeof value['prepare'] !== 'function') {
    throw new TypeError('Component definition prepare must be a function when provided.');
  }
  if (semantics === 'semantic' && typeof value['accessibility'] !== 'function') {
    throw new TypeError('Semantic component definition requires accessibility().');
  }
  for (const hook of [
    'renderBeforeChildren',
    'renderAfterChildren',
    'capture',
    'implementationSlots',
    'layer',
    'focusScope',
    'focusTargets',
    'hitTargets',
    'keys',
    'onInput',
    'onPaste'
  ]) {
    if (value[hook] !== undefined && typeof value[hook] !== 'function') {
      throw new TypeError(`Component definition ${hook} must be a function when provided.`);
    }
  }
  assertPointerDefinition(value['pointer']);
  if (value['sensitiveInput'] !== undefined && typeof value['sensitiveInput'] !== 'boolean') {
    throw new TypeError('Component definition sensitiveInput must be a boolean.');
  }
  if (value['sensitiveInput'] === true && value['onInput'] === undefined && value['onPaste'] === undefined) {
    throw new TypeError('A sensitive-input component must declare onInput or onPaste.');
  }
  if (value['clipChildren'] !== undefined && typeof value['clipChildren'] !== 'boolean') {
    throw new TypeError('Component definition clipChildren must be a boolean.');
  }
}

function runtimeDefinition(definition: NormalizedDefinition): RuntimeComponentDefinition {
  return Object.freeze({
    name: definition.name,
    sensitiveInput: definition.semantics === 'semantic' && definition.sensitiveInput,
    inspection: Object.freeze({
      identity: definition.identity,
      structure: definition.structure,
      semantics: definition.semantics,
      states: definition.states,
      actions: componentInspectionActions(definition)
    }),
    renderer: adaptDefinition(definition)
  });
}

function componentInspectionActions(
  definition: NormalizedDefinition
): import('../element/inspection.ts').ComponentCapabilityInspection['actions'] {
  if (definition.semantics === 'decorative') return Object.freeze([]);
  return Object.freeze([
    ...(definition.keys === undefined ? [] : ['keyboard' as const]),
    ...(definition.onInput === undefined ? [] : ['input' as const]),
    ...(definition.onPaste === undefined ? [] : ['paste' as const]),
    ...(definition.hitTargets === undefined && definition.pointer === undefined
      ? []
      : ['pointer' as const])
  ]);
}

function adaptDefinition(definition: NormalizedDefinition): RenderNodeRenderer<unknown, 'component'> {
  const renderer: RenderNodeRenderer<unknown, 'component'> = {
    ...(definition.structure !== 'leaf' && definition.clipChildren === true ? { clipChildren: true } : {}),
    measure: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'measure', () =>
      definition.structure === 'composed'
        ? input.measureChild(0)
        : definition.measure.call(undefined, {
            ...componentBaseInput(input.renderNode, input.theme, input.widthProfile),
            constraints: { width: input.bounds.width, height: input.bounds.height },
            childCount: input.childCount,
            measureChild: input.measureChild,
            slots: componentSlotMeasurements(input.renderNode.props.slots, input.measureChild)
          })
    ),
    ...(definition.structure === 'leaf' ? {} : {
      layout: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'layout', () =>
        definition.structure === 'composed'
          ? [input.bounds]
          : normalizeComponentLayout(definition.layout.call(undefined, {
              ...componentInput(input.renderNode, input.bounds, input.viewport, input.theme, input.widthProfile),
              childCount: input.childCount,
              measureChild: input.measureChild,
              slots: componentSlotMeasurements(input.renderNode.props.slots, input.measureChild)
            }), definition, input.renderNode.props.slots, localBounds(input.bounds), input.childCount)
              .map((bounds) => toAbsoluteRect(bounds, input.bounds))
      )
    }),
    render: (input) => {
      const renderInput = componentRenderInput(definition, input);
      if (definition.structure === 'leaf') {
        executeComponentPhase(definition.name, input.renderNode.id, 'paint', () =>
          { definition.render.call(undefined, renderInput); }
        );
        return;
      }
      if (definition.structure === 'composed') {
        input.renderChildren();
        return;
      }
      if (definition.renderBeforeChildren !== undefined) {
        executeComponentPhase(definition.name, input.renderNode.id, 'paint', () =>
          definition.renderBeforeChildren?.call(undefined, renderInput)
        );
      }
      input.renderChildren();
      if (definition.renderAfterChildren !== undefined) {
        executeComponentPhase(definition.name, input.renderNode.id, 'paint', () =>
          definition.renderAfterChildren?.call(undefined, renderInput)
        );
      }
    },
    ...(definition.semantics === 'decorative' ? {} : {
      accessibility: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'accessibility', () =>
        definition.accessibility.call(undefined, {
        ...componentInput(
          input.renderNode,
          input.layoutNode.bounds,
          input.layoutNode.viewport,
          input.theme,
          input.widthProfile
        ),
        id: input.id,
        focused: input.focused,
        focus: input.focus,
        ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
        children: input.children,
        slots: accessibleSlotValues(
          input.renderNode.props.slots,
          input.renderNode.children ?? [],
          input.accessibleNodes
        )
        })
      ),
      ...(definition.focusTargets === undefined ? {} : {
        focusTargets: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'focus', () =>
          (definition.focusTargets?.call(undefined, componentInteractionInput(
          definition,
          input.renderNode,
          input.bounds,
          input.viewport,
          input.theme,
          input.widthProfile
          )) ?? []).map((target) => toAbsoluteFocusTarget(target, input.bounds))
        )
      }),
      ...(definition.hitTargets === undefined ? {} : {
        hitTargets: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'pointer', () => mapHitTargets(
          (definition.hitTargets?.call(undefined, componentInteractionInput(
            definition,
            input.renderNode,
            input.bounds,
            input.layoutNode.viewport,
            input.theme,
            input.widthProfile
          )) ?? []).map((target) => ({ ...target, bounds: toAbsoluteRect(target.bounds, input.bounds) })),
          actionMapper(input.renderNode),
          definition.name,
          input.renderNode.id
        ))
      })
    })
  };
  return Object.freeze(renderer);
}

function accessibleSlotValues(
  ranges: readonly ComponentSlotRange[],
  roots: readonly RenderNode[],
  accessibleNodes: ReadonlyMap<RenderNode, AccessibleNode>
): ComponentAccessibleSlotValues<ComponentSlotShape> {
  return Object.freeze(Object.fromEntries(ranges.map((range) => [
    range.name,
    Object.freeze(range.accessiblePaths.flatMap((path) => {
      const root = renderNodeAtPath(roots, path);
      const accessible = root === undefined ? undefined : accessibleNodes.get(root);
      return accessible === undefined ? [] : [accessible];
    }))
  ])));
}

function renderNodeAtPath(
  roots: readonly RenderNode[],
  path: readonly number[]
): RenderNode | undefined {
  let nodes = roots;
  let current: RenderNode | undefined;
  for (const index of path) {
    current = nodes[index];
    if (current === undefined) return undefined;
    nodes = current.children ?? [];
  }
  return current;
}

function componentBaseInput(
  renderNode: {
    readonly id?: string;
    readonly props: { readonly options: Readonly<Record<string, unknown>> };
    readonly state?: ElementState;
  },
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ComponentBaseInput<Readonly<Record<string, unknown>>> {
  return {
    ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
    model: renderNode.props.options,
    disabled: renderNode.state?.disabled === true,
    busy: renderNode.state?.busy === true,
    readOnly: renderNode.state?.readOnly === true,
    inert: renderNode.state?.inert === true,
    theme,
    widthProfile
  };
}

function componentInput(
  renderNode: {
    readonly id?: string;
    readonly props: { readonly options: Readonly<Record<string, unknown>> };
    readonly state?: ElementState;
  },
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ComponentInput<Readonly<Record<string, unknown>>> {
  return {
    ...componentBaseInput(renderNode, theme, widthProfile),
    bounds: localBounds(bounds),
    viewport: localViewport(bounds, viewport)
  };
}

function componentRenderInput(
  definition: NormalizedDefinition,
  input: Parameters<RenderNodeRenderer<unknown, 'component'>['render']>[0]
): ComponentRenderInput<Readonly<Record<string, unknown>>> {
  return {
    ...componentInteractionInput(
      definition,
      input.renderNode,
      input.layoutNode.bounds,
      input.layoutNode.viewport,
      input.theme,
      input.widthProfile
    ),
    target: input.buffer,
    focus: input.focus,
    ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
  };
}

function componentInteractionInput(
  definition: NormalizedDefinition,
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0] & {
    readonly props: { readonly options: Readonly<Record<string, unknown>> };
    readonly state?: ElementState;
  },
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ComponentInteractionInput<Readonly<Record<string, unknown>>> {
  return {
    ...componentInput(renderNode, bounds, viewport, theme, widthProfile),
    ...componentHelpers(renderNode, definition)
  };
}

function componentHelpers(
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0],
  definition: NormalizedDefinition
): Pick<ComponentRenderInput<Readonly<Record<string, unknown>>>, 'style' | 'source'> {
  return {
    style(input) {
      if (input.part !== 'root' && !definition.partSet.has(input.part)) {
        throw new TypeError(`Component "${definition.name}" requested undeclared style part "${input.part}".`);
      }
      return resolveRenderNodeStyle(renderNode, input);
    },
    source(input = {}) {
      const description = input.description ?? input.partName;
      return renderNodeFrameSource({
        ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
        kind: definition.name
      }, {
        rendererFamily: 'component',
        cellRole: 'content',
        ...input,
        ...(description === undefined ? {} : { description })
      });
    }
  };
}

function prepareComponentOptions(
  value: ComponentInstanceOptions,
  definition: NormalizedDefinition,
  state: Readonly<ElementState>
): Readonly<Record<string, unknown>> {
  const customEntries = Object.entries(value)
    .filter(([field]) => !componentInstanceFields.has(field as ComponentReservedOption));
  const allowed = new Set(definition.optionFields);
  const unsupported = customEntries.find(([field]) => !allowed.has(field))?.[0];
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${definition.name}" options contain unknown field "${unsupported}".`);
  }
  if (definition.prepare === undefined) return Object.freeze({});
  const custom = Object.freeze(Object.fromEntries(customEntries));
  const prepared = executeComponentPhase(definition.name, value.id, 'prepare', () =>
    definition.prepare?.call(undefined, custom, {
      ...(value.id === undefined ? {} : { id: value.id }),
      disabled: state.disabled === true,
      busy: state.busy === true,
      readOnly: state.readOnly === true,
      inert: state.inert === true
    })
  );
  if (!isNonArrayObject(prepared)) {
    throw new TypeError(`Component "${definition.name}" prepare must return an object.`);
  }
  return immutablePreparedModel(prepared, definition.name);
}

function componentSlotChildren(
  value: ComponentInstanceOptions,
  definition: Extract<NormalizedDefinition, { readonly structure: 'composite' | 'composed' }>,
  behavior: ComponentBehaviorInput<Readonly<Record<string, unknown>>>,
  toActionMessage: ((action: unknown) => unknown) | undefined,
  styles: ElementStyles | undefined,
  layer: ElementLayer | undefined
): PreparedSlotContent {
  if (definition.structure === 'composed') {
    const supplied = callerSlotInput(value, definition);
    const mapped = Object.freeze(Object.fromEntries(definition.slots.map((slot) => [
      slot.name,
      mappedComposedSlotValue(
        supplied?.[slot.name],
        slot,
        definition,
        behavior,
        toActionMessage,
        value.id
      )
    ])));
    const inspectionChildren = definition.slots.flatMap((slot) =>
      slotElements(mapped[slot.name], slot, definition.name).map((element) => toRenderNode(element))
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
      markImplementationStructure(node, callerOwnedRoots)
    );
    return Object.freeze({
      children,
      inspectionChildren: Object.freeze(inspectionChildren),
      ranges: Object.freeze(definition.slots.map((slot) => Object.freeze({
        name: slot.name,
        start: 0,
        count: 0,
        accessiblePaths: renderNodePaths(
          children,
          new Set(slotElements(mapped[slot.name], slot, definition.name)
            .map((element) => toRenderNode(element)))
        )
      })))
    });
  }
  const supplied = value.slots;
  const callerNames = new Set(definition.slots
    .filter((slot) => slot.owner === 'caller')
    .map((slot) => slot.name));
  const requiresSlots = definition.slots.some((slot) =>
    slot.owner === 'caller' && slot.cardinality !== 'optional'
  );
  if (requiresSlots && !isNonArrayObject(supplied)) {
    throw new TypeError(`Component "${definition.name}" requires a slots object.`);
  }
  if (isNonArrayObject(supplied)) {
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
          slots: Object.freeze({ ...(supplied ?? {}) }),
          emit: (action) => mapComponentAction(action, toActionMessage),
          ...(styles === undefined ? {} : { styles }),
          ...(layer === undefined ? {} : { layer })
        })
      );
  if (implementation !== undefined && !isNonArrayObject(implementation)) {
    throw new TypeError(`Component "${definition.name}" implementationSlots must return an object.`);
  }
  if (isNonArrayObject(implementation)) {
    const implementationNames = new Set(definition.slots
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
  for (const slot of definition.slots) {
    const content = slot.owner === 'caller'
      ? supplied?.[slot.name]
      : implementation?.[slot.name];
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
      ? mapped.map((node) => markImplementationStructure(node))
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
  definition: Extract<NormalizedDefinition, { readonly structure: 'composed' }>
): Readonly<Record<string, unknown>> | undefined {
  const supplied = value.slots;
  const names = new Set(definition.slots.map((slot) => slot.name));
  const requiresSlots = definition.slots.some((slot) => slot.cardinality !== 'optional');
  if (requiresSlots && !isNonArrayObject(supplied)) {
    throw new TypeError(`Component "${definition.name}" requires a slots object.`);
  }
  if (isNonArrayObject(supplied)) {
    const unsupported = Object.keys(supplied).find((name) => !names.has(name));
    if (unsupported !== undefined) {
      throw new TypeError(`Component "${definition.name}" received unknown slot "${unsupported}".`);
    }
  }
  return supplied;
}

function mappedComposedSlotValue(
  value: unknown,
  slot: NormalizedSlot,
  definition: Extract<NormalizedDefinition, { readonly structure: 'composed' }>,
  behavior: ComponentBehaviorInput<Readonly<Record<string, unknown>>>,
  toActionMessage: ((action: unknown) => unknown) | undefined,
  instanceId: string | undefined
): unknown {
  const elements = slotElements(value, slot, definition.name);
  const mapped = elements.map((element) => slot.messages === 'bubble'
    ? element
    : mapElementMessages(element, (message) => {
        if (slot.messages === 'none') {
          throw new TypeError(`Component "${definition.name}" slot "${slot.name}" forbids child messages.`);
        }
        return executeComponentPhase(definition.name, instanceId, 'action', () => mapComponentAction(
          definition.capture?.call(undefined, { ...behavior, slot: slot.name, message }),
          toActionMessage
        ));
      }));
  if (slot.cardinality === 'many') return Object.freeze(mapped);
  return mapped[0];
}

function slotElements(
  value: unknown,
  slot: NormalizedSlot,
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

function assertComponentInstanceOptions(
  value: unknown,
  definition: NormalizedDefinition
): asserts value is ComponentInstanceOptions {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${definition.name}" options must be an object.`);
  }
  if (definition.identity === 'required'
    && (typeof value['id'] !== 'string' || value['id'].trim() === '')) {
    throw new TypeError(`Component "${definition.name}" requires a non-empty id.`);
  }
  if (value['id'] !== undefined && (typeof value['id'] !== 'string' || value['id'].trim() === '')) {
    throw new TypeError(`Component "${definition.name}" id must be a non-empty string when provided.`);
  }
  if (Object.hasOwn(value, 'children')) {
    throw new TypeError(
      `Component "${definition.name}" options contain unknown field "children"; use declared named slots.`
    );
  }
  if (definition.structure === 'leaf' && value['slots'] !== undefined) {
    throw new TypeError(`Component "${definition.name}" is a leaf and cannot contain slots.`);
  }
  if (value['meta'] !== undefined && !isNonArrayObject(value['meta'])) {
    throw new TypeError(`Component "${definition.name}" meta must be an object when provided.`);
  }
  assertComponentMetadata(value['meta'], definition);
  for (const removedInstanceHandler of ['keys', 'onInput', 'onPaste', 'pointer'] as const) {
    if (value[removedInstanceHandler] !== undefined) {
      throw new TypeError(
        `Component "${definition.name}" ${removedInstanceHandler} behavior must be declared by the definition.`
      );
    }
  }
  if (definition.semantics === 'decorative') {
    if (elementStateFields.some((field) => value[field] !== undefined)
      || value['onAction'] !== undefined
      || isNonArrayObject(value['meta'])
        && value['meta']['focus'] !== undefined) {
      throw new TypeError(
        `Decorative component "${definition.name}" cannot define state, actions, or focus options.`
      );
    }
    return;
  }
  assertComponentState(value, definition);
  const actionful = definitionHasActions(definition);
  if (value['onAction'] !== undefined && typeof value['onAction'] !== 'function') {
    throw new TypeError(`Component "${definition.name}" onAction must be a function when provided.`);
  }
  if (actionful && value['disabled'] !== true && typeof value['onAction'] !== 'function') {
    throw new TypeError(`Component "${definition.name}" requires onAction to map its semantic actions.`);
  }
  if (actionful && value['disabled'] === true && value['onAction'] !== undefined) {
    throw new TypeError(`Disabled component "${definition.name}" cannot accept onAction.`);
  }
  if (!actionful && value['onAction'] !== undefined) {
    throw new TypeError(`Component "${definition.name}" does not define actions and cannot accept onAction.`);
  }
}

function definitionHasActions(
  definition: Extract<NormalizedDefinition, { readonly semantics: 'semantic' }>
): boolean {
  return definition.hitTargets !== undefined
    || definition.structure !== 'leaf' && definition.capture !== undefined
    || definition.keys !== undefined
    || definition.onInput !== undefined
    || definition.onPaste !== undefined
    || definition.pointer !== undefined;
}

function componentBehaviorInput(
  id: string | undefined,
  model: Readonly<Record<string, unknown>>,
  state: Readonly<ElementState>
): ComponentBehaviorInput<Readonly<Record<string, unknown>>> {
  return Object.freeze({
    ...(id === undefined ? {} : { id }),
    model,
    disabled: state.disabled === true,
    busy: state.busy === true,
    readOnly: state.readOnly === true,
    inert: state.inert === true
  });
}

function normalizeComponentState(
  value: ComponentInstanceOptions,
  states: readonly ComponentStateCapability[]
): Readonly<ElementState> {
  const enabled = new Set(states);
  return Object.freeze({
    ...(enabled.has('disabled') && value.disabled === true ? { disabled: true } : {}),
    ...(enabled.has('busy') && value.busy === true ? { busy: true } : {}),
    ...(enabled.has('readOnly') && value.readOnly === true ? { readOnly: true } : {}),
    ...(enabled.has('inert') && value.inert === true ? { inert: true } : {})
  });
}

function componentPointerInteraction(
  definition: NormalizedDefinition,
  behavior: ComponentBehaviorInput<Readonly<Record<string, unknown>>>,
  toActionMessage: ((action: unknown) => unknown) | undefined,
  instanceId: string | undefined
): PointerInteractionOptions<unknown> | undefined {
  if (definition.semantics !== 'semantic' || definition.pointer === undefined) return undefined;
  const state = definition.pointer.state === undefined
    ? undefined
    : executeComponentPhase(definition.name, instanceId, 'pointer', () => {
        const produced = definition.pointer?.state?.call(undefined, behavior);
        return produced === undefined ? undefined : normalizedPointerState(produced, definition.name);
      });
  if (definition.pointer.state !== undefined && state === undefined) return undefined;
  return {
    ...(state === undefined ? {} : { state }),
    onAction: (action: PointerInteractionAction) => executeComponentPhase(
      definition.name,
      instanceId,
      'pointer',
      () => mapComponentAction(
        definition.pointer?.onAction.call(undefined, action, behavior),
        toActionMessage
      )
    )
  };
}

function assertComponentState(
  value: ComponentInstanceOptions,
  definition: NormalizedDefinition
): void {
  const allowed = new Set(definition.states);
  for (const field of elementStateFields) {
    if (value[field] !== undefined && !allowed.has(field)) {
      throw new TypeError(`Component "${definition.name}" does not declare the ${field} capability.`);
    }
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`Component "${definition.name}" ${field} must be a boolean.`);
    }
  }
}

function assertComponentMetadata(
  value: ComponentInstanceOptions['meta'],
  definition: NormalizedDefinition
): void {
  if (value === undefined) return;
  const allowed = new Set(definition.metadata);
  const unsupported = findUnsupportedField(value, allowed);
  if (unsupported !== undefined) {
    throw new TypeError(
      `Component "${definition.name}" does not permit caller metadata field "${unsupported}".`
    );
  }
  if (value.focus !== undefined) assertCallerFocus(value.focus, definition.name);
  if (value.layer !== undefined) normalizeElementLayer(value.layer, definition.name, 'caller');
  if (value.styles !== undefined) normalizeElementStyles(value.styles, definition);
}

function componentInstanceMeta(
  value: ComponentInstanceOptions,
  definition: NormalizedDefinition,
  behavior: ComponentBehaviorInput<Readonly<Record<string, unknown>>>,
  requiredLayer: ElementLayer | undefined
): ComponentInstanceOptions['meta'] & { readonly accessibility?: { readonly decorative: true } } {
  const caller = value.meta;
  const requiredScope = definition.semantics === 'semantic' && definition.focusScope !== undefined
    ? executeComponentPhase(definition.name, value.id, 'metadata', () =>
        normalizeFocusScope(
          definition.focusScope?.call(undefined, behavior),
          definition.name
        )
      )
    : undefined;
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
  const styles = caller?.styles === undefined
    ? undefined
    : normalizeElementStyles(caller.styles, definition);
  return Object.freeze({
    ...(focus === undefined ? {} : { focus }),
    ...(layer === undefined ? {} : { layer }),
    ...(styles === undefined ? {} : { styles }),
    ...(definition.semantics === 'decorative'
      ? { accessibility: Object.freeze({ decorative: true as const }) }
      : {})
  });
}

function componentDefinitionLayer(
  instanceId: string | undefined,
  definition: NormalizedDefinition,
  behavior: ComponentBehaviorInput<Readonly<Record<string, unknown>>>
): ElementLayer | undefined {
  return definition.layer === undefined
    ? undefined
    : executeComponentPhase(definition.name, instanceId, 'metadata', () =>
        normalizeElementLayer(
          definition.layer?.call(undefined, behavior),
          definition.name,
          'definition'
        )
      );
}

function assertCallerFocus(value: unknown, component: string): void {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" meta.focus must be an object.`);
  }
  const unsupported = findUnsupportedField(value, new Set(['disabled', 'order']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" meta.focus contains unknown field "${unsupported}".`);
  }
  if (value['disabled'] !== undefined && typeof value['disabled'] !== 'boolean') {
    throw new TypeError(`Component "${component}" meta.focus.disabled must be a boolean.`);
  }
  if (value['order'] !== undefined
    && (typeof value['order'] !== 'number'
      || !Number.isFinite(value['order'])
      || !Number.isInteger(value['order']))) {
    throw new TypeError(`Component "${component}" meta.focus.order must be a finite integer.`);
  }
}

function normalizeFocusScope(
  value: unknown,
  component: string
): ElementFocusScope | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" focusScope must return an object or undefined.`);
  }
  const unsupported = findUnsupportedField(value, new Set(['kind', 'initialFocus', 'restore']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" focusScope contains unknown field "${unsupported}".`);
  }
  if (value['kind'] !== 'contain') {
    throw new TypeError(`Component "${component}" focusScope.kind must be "contain".`);
  }
  if (value['restore'] !== undefined && typeof value['restore'] !== 'boolean') {
    throw new TypeError(`Component "${component}" focusScope.restore must be a boolean.`);
  }
  const initialFocus = value['initialFocus'] === undefined
    ? undefined
    : normalizeInitialFocusSelector(value['initialFocus'], component);
  return Object.freeze({
    kind: 'contain' as const,
    ...(initialFocus === undefined ? {} : { initialFocus }),
    ...(value['restore'] === undefined ? {} : { restore: value['restore'] })
  });
}

function normalizeInitialFocusSelector(
  value: unknown,
  component: string
): NonNullable<ElementFocusScope['initialFocus']> {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" initial focus selector must be an object.`);
  }
  if (value['kind'] === 'path') {
    const path = value['path'];
    const unsupported = findUnsupportedField(value, new Set(['kind', 'path']));
    if (unsupported !== undefined || !Array.isArray(path)
      || path.length === 0
      || path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new TypeError(`Component "${component}" initial focus path must contain non-empty segments.`);
    }
    return Object.freeze({ kind: 'path' as const, path: Object.freeze(path) });
  }
  const kind = value['kind'];
  const supported = kind === 'element'
    ? new Set(['kind', 'elementId'])
    : kind === 'elementTarget'
      ? new Set(['kind', 'elementId', 'targetId'])
      : undefined;
  const unsupported = supported === undefined ? undefined : findUnsupportedField(value, supported);
  if (supported === undefined || unsupported !== undefined
    || typeof value['elementId'] !== 'string' || value['elementId'].trim() === '') {
    throw new TypeError(`Component "${component}" initial focus selector is invalid.`);
  }
  const elementId = value['elementId'];
  if (kind === 'element') {
    return Object.freeze({ kind: 'element' as const, elementId });
  }
  const targetId = value['targetId'];
  if (typeof targetId !== 'string' || targetId.trim() === '') {
    throw new TypeError(`Component "${component}" initial focus targetId must be non-empty.`);
  }
  return Object.freeze({
    kind: 'elementTarget' as const,
    elementId,
    targetId
  });
}

function normalizeElementLayer(
  value: unknown,
  component: string,
  owner: 'caller' | 'definition'
): ElementLayer | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" ${owner} layer must be an object or undefined.`);
  }
  const unsupported = findUnsupportedField(
    value,
    new Set(['zIndex', 'visible', 'underlay', 'backdrop', 'overflowPriority'])
  );
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" ${owner} layer contains unknown field "${unsupported}".`);
  }
  const zIndex = value['zIndex'];
  const visible = value['visible'];
  const underlay = value['underlay'];
  const backdrop = value['backdrop'];
  const overflowPriority = value['overflowPriority'];
  if (zIndex !== undefined
    && (typeof zIndex !== 'number' || !Number.isFinite(zIndex) || !Number.isInteger(zIndex))) {
    throw new TypeError(`Component "${component}" ${owner} layer.zIndex must be a finite integer.`);
  }
  if (visible !== undefined && typeof visible !== 'boolean') {
    throw new TypeError(`Component "${component}" ${owner} layer.visible must be a boolean.`);
  }
  if (underlay !== undefined
    && !isStringMember(underlay, ['clear', 'preserve', 'inheritBackground'])) {
    throw new TypeError(`Component "${component}" ${owner} layer.underlay is invalid.`);
  }
  if (backdrop !== undefined && backdrop !== 'viewport') {
    throw new TypeError(`Component "${component}" ${owner} layer.backdrop is invalid.`);
  }
  if (overflowPriority !== undefined
    && !isStringMember(overflowPriority, ['required', 'important', 'secondary', 'decorative'])) {
    throw new TypeError(`Component "${component}" ${owner} layer.overflowPriority is invalid.`);
  }
  return Object.freeze({
    ...(zIndex === undefined ? {} : { zIndex }),
    ...(visible === undefined ? {} : { visible }),
    ...(underlay === undefined ? {} : { underlay }),
    ...(backdrop === undefined ? {} : { backdrop }),
    ...(overflowPriority === undefined ? {} : { overflowPriority })
  });
}

function normalizeElementStyles(
  value: unknown,
  definition: NormalizedDefinition
): ElementStyles {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${definition.name}" meta.styles must be an object.`);
  }
  const unsupported = findUnsupportedField(value, new Set(['root', 'parts', 'states']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${definition.name}" meta.styles contains unknown field "${unsupported}".`);
  }
  const rootValue = value['root'];
  const root = rootValue === undefined
    ? undefined
    : normalizeTerminalStyle(rootValue, `Component "${definition.name}" meta.styles.root`);
  const parts = normalizeStyleMap(
    value['parts'],
    new Set(definition.parts),
    `Component "${definition.name}" meta.styles.parts`
  );
  const states = normalizeStyleMap(
    value['states'],
    new Set(['focused', 'hovered', 'pressed', 'selected', 'disabled', 'active']),
    `Component "${definition.name}" meta.styles.states`
  );
  return Object.freeze({
    ...(root === undefined ? {} : { root: Object.freeze(root) }),
    ...(parts === undefined ? {} : { parts }),
    ...(states === undefined ? {} : { states })
  });
}

function normalizeStyleMap(
  value: unknown,
  allowed: ReadonlySet<string>,
  subject: string
): Readonly<Record<string, TerminalStyle>> | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const unsupported = findUnsupportedField(value, allowed);
  if (unsupported !== undefined) throw new TypeError(`${subject} contains unknown field "${unsupported}".`);
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([name, style]) => [
    name,
    Object.freeze(normalizeTerminalStyle(style, `${subject}.${name}`))
  ])));
}

function assertUniqueStringMembers(
  value: unknown,
  allowedValues: readonly string[],
  subject: string
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)
    || value.some((member) => typeof member !== 'string' || !allowedValues.includes(member))
    || new Set(value).size !== value.length) {
    throw new TypeError(`${subject} must contain unique supported values.`);
  }
}

function normalizeChildBounds(values: unknown, parent: Rect, childCount: number): readonly Rect[] {
  if (!Array.isArray(values)) throw new TypeError('Composite component layout must return an array.');
  if (values.length !== childCount) {
    throw new RangeError(`Composite component layout returned ${String(values.length)} bounds for ${String(childCount)} children.`);
  }
  return Object.freeze(values.map((value, index) => {
    if (!rectHasValidCoordinates(value) || !rectFits(value, parent)) {
      throw new RangeError(`Composite component child ${String(index)} returned bounds outside its parent.`);
    }
    return Object.freeze({ ...value });
  }));
}

function componentSlotMeasurements(
  ranges: readonly { readonly name: string; readonly start: number; readonly count: number }[],
  measureChild: (index: number) => Measurement
): ComponentSlotMeasurements<ComponentSlotsDefinition> {
  const byName = new Map(ranges.map((range) => [range.name, range]));
  return Object.freeze({
    count(name: string) {
      return byName.get(name)?.count ?? 0;
    },
    measure(name: string, index = 0) {
      const range = byName.get(name);
      if (range === undefined || !Number.isSafeInteger(index) || index < 0 || index >= range.count) {
        throw new RangeError(`Component slot "${name}" has no child at index ${String(index)}.`);
      }
      return measureChild(range.start + index);
    }
  });
}

function normalizeComponentLayout(
  value: unknown,
  definition: Extract<NormalizedDefinition, { readonly structure: 'composite' }>,
  ranges: readonly { readonly name: string; readonly start: number; readonly count: number }[],
  parent: Rect,
  childCount: number
): readonly Rect[] {
  if (!isNonArrayObject(value)) throw new TypeError('Composite component layout must return a slot bounds object.');
  const allowed = new Set(definition.slots.map((slot) => slot.name));
  const unsupported = findUnsupportedField(value, allowed);
  if (unsupported !== undefined) {
    throw new TypeError(`Composite component layout contains unknown slot "${unsupported}".`);
  }
  const flattened: Rect[] = [];
  for (const slot of definition.slots) {
    const range = ranges.find((candidate) => candidate.name === slot.name);
    const count = range?.count ?? 0;
    const current = value[slot.name];
    const bounds = slot.cardinality === 'many'
      ? current
      : current === undefined ? [] : [current];
    if (!Array.isArray(bounds) || bounds.length !== count) {
      throw new RangeError(
        `Composite component slot "${slot.name}" returned invalid bounds for ${String(count)} children.`
      );
    }
    flattened.push(...bounds as Rect[]);
  }
  return normalizeChildBounds(flattened, parent, childCount);
}

function localBounds(bounds: Rect): Rect {
  return Object.freeze({ row: 0, column: 0, width: bounds.width, height: bounds.height });
}

function localViewport(bounds: Rect, viewport: Rect): Rect {
  const top = Math.max(bounds.row, viewport.row);
  const left = Math.max(bounds.column, viewport.column);
  const bottom = Math.min(bounds.row + bounds.height, viewport.row + viewport.height);
  const right = Math.min(bounds.column + bounds.width, viewport.column + viewport.width);
  return Object.freeze({
    row: Math.max(0, top - bounds.row),
    column: Math.max(0, left - bounds.column),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  });
}

function toAbsoluteRect(value: Rect, allocation: Rect): Rect {
  return Object.freeze({
    row: allocation.row + value.row,
    column: allocation.column + value.column,
    width: value.width,
    height: value.height
  });
}

function toAbsoluteFocusTarget(target: FocusTarget, allocation: Rect): FocusTarget {
  return Object.freeze({
    ...target,
    bounds: toAbsoluteRect(target.bounds, allocation),
    ...(target.cursor === undefined
      ? {}
      : {
          cursor: Object.freeze({
            ...target.cursor,
            row: allocation.row + target.cursor.row,
            column: allocation.column + target.cursor.column
          })
        })
  });
}

function rectHasValidCoordinates(value: unknown): value is Rect {
  if (!isNonArrayObject(value)) return false;
  const width = value['width'];
  const height = value['height'];
  return Number.isSafeInteger(value['row'])
    && Number.isSafeInteger(value['column'])
    && typeof width === 'number'
    && Number.isSafeInteger(width)
    && width >= 0
    && typeof height === 'number'
    && Number.isSafeInteger(height)
    && height >= 0;
}

function rectFits(value: Rect, parent: Rect): boolean {
  return value.row >= parent.row
    && value.column >= parent.column
    && value.row + value.height <= parent.row + parent.height
    && value.column + value.width <= parent.column + parent.width;
}

function isQualifiedComponentName(value: string): boolean {
  return /^(?:@[A-Za-z][A-Za-z0-9_.-]*\/[A-Za-z][A-Za-z0-9_.-]*|[A-Za-z][A-Za-z0-9_.-]*)(?:\/[A-Za-z][A-Za-z0-9_.-]*)+$/u.test(value);
}
