import type { AccessibleNode, AccessibilityOptions } from '../accessibility/index.ts';
import type {
  Element,
  ElementChildren,
  ElementChildrenMessage
} from '../element/index.ts';
import type {
  ElementKeyBindings,
  ElementMeta,
  ElementState
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
  BindableKeyName,
  InputTrigger,
  KeyName,
  KeyModifierTrigger
} from '../input/types.ts';
import {
  keyEventTypes,
  keyLocations,
  keyNames
} from '../input/types.ts';
import type {
  MessageResolution,
  PointerInteractionAction,
  PointerInteractionState
} from '../interaction/index.ts';
import { isIgnoredMessage } from '../interaction/index.ts';
import {
  componentElementFromRenderNode,
  toRenderNodes
} from '../renderer/model/element.ts';
import { renderNodeInteraction } from '../renderer/model/metadata.ts';
import type { RenderNodeRenderer } from '../renderer/model/renderer.ts';
import type { RuntimeComponentDefinition } from '../renderer/model/types.ts';
import type {
  FocusTarget,
  HitTarget,
  Measurement,
  RenderFocusRelation,
  RenderSourceInput,
  RenderStyleInput,
  RenderTarget
} from '../renderer/contracts.ts';
import { resolveRenderNodeStyle } from '../renderer/style-resolution.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalStyle } from '../visual/render.ts';
import type { FrameCellSource } from '../visual/source.ts';
import { renderNodeFrameSource } from '../visual/source.ts';

export type ComponentStyleInput<TPart extends string> = RenderStyleInput<TPart>;
export type ComponentSourceInput = RenderSourceInput;
export type ComponentState = ElementState;
export type ComponentDefinitionName = `${string}/${string}`;

export interface ComponentMeasureConstraints {
  readonly width: number;
  readonly height: number;
}

interface ComponentBehaviorInput<TOptions extends object> {
  readonly options: Readonly<TOptions>;
  readonly state: Readonly<ComponentState>;
}

interface ComponentBaseInput<TOptions extends object>
  extends ComponentBehaviorInput<TOptions> {
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface ComponentInput<TOptions extends object>
  extends ComponentBaseInput<TOptions> {
  readonly bounds: Rect;
  readonly viewport: Rect;
}

export interface ComponentMeasureInput<TOptions extends object>
  extends ComponentBaseInput<TOptions> {
  readonly constraints: ComponentMeasureConstraints;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface ComponentLayoutInput<TOptions extends object>
  extends ComponentInput<TOptions> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface ComponentRenderInput<
  TOptions extends object,
  TPart extends string = string
> extends ComponentInput<TOptions> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
  readonly style: (input: ComponentStyleInput<TPart>) => TerminalStyle | undefined;
  readonly source: (input?: ComponentSourceInput) => FrameCellSource;
}

export interface ComponentAccessibilityInput<TOptions extends object>
  extends ComponentInput<TOptions> {
  readonly id: string;
  readonly focused: boolean;
  readonly focusedTargetId?: string;
  readonly children: readonly AccessibleNode[];
}

export interface ComponentTextActionInput<TOptions extends object>
  extends ComponentBehaviorInput<TOptions> {
  readonly text: string;
}

export interface ComponentPointerActions<
  TOptions extends object,
  TAction
> {
  readonly state?: (
    this: undefined,
    input: ComponentBehaviorInput<TOptions>
  ) => PointerInteractionState;
  readonly onAction: (
    this: undefined,
    action: PointerInteractionAction,
    input: ComponentBehaviorInput<TOptions>
  ) => MessageResolution<TAction>;
}

type NoComponentOptions = Readonly<Record<never, never>>;

interface ComponentDefinitionIdentity {
  /** A package-qualified identity such as `acme/widgets/badge`. */
  readonly name: ComponentDefinitionName;
}

interface EmptyComponentOptionsDefinition {
  readonly decodeOptions?: never;
}

interface DecodedComponentOptionsDefinition<TOptions extends object> {
  readonly decodeOptions: (this: undefined, value: unknown) => TOptions;
}

type ComponentOptionsDefinition<TOptions extends object> =
  keyof TOptions extends never
    ? EmptyComponentOptionsDefinition | DecodedComponentOptionsDefinition<TOptions>
    : DecodedComponentOptionsDefinition<TOptions>;

type ComponentDefinitionBase<
  TOptions extends object,
  TPart extends string
> = ComponentDefinitionIdentity & ComponentOptionsDefinition<TOptions> & {
  readonly parts?: readonly TPart[];
  readonly measure: (
    this: undefined,
    input: ComponentMeasureInput<TOptions>
  ) => Measurement;
};

interface InteractiveDefinition<TOptions extends object, TAction> {
  readonly focusTargets?: (
    this: undefined,
    input: ComponentInput<TOptions>
  ) => readonly FocusTarget[];
  readonly hitTargets?: (
    this: undefined,
    input: ComponentInput<TOptions>
  ) => readonly HitTarget<TAction>[];
  readonly keys?: (
    this: undefined,
    input: ComponentBehaviorInput<TOptions>
  ) => ElementKeyBindings<TAction>;
  readonly onInput?: (
    this: undefined,
    input: ComponentTextActionInput<TOptions>
  ) => MessageResolution<TAction>;
  readonly onPaste?: (
    this: undefined,
    input: ComponentTextActionInput<TOptions>
  ) => MessageResolution<TAction>;
  readonly pointer?: ComponentPointerActions<TOptions, TAction>;
}

interface SemanticDefinition<TOptions extends object, TAction>
  extends InteractiveDefinition<TOptions, TAction> {
  readonly semantics: 'semantic';
  readonly accessibility: (
    this: undefined,
    input: ComponentAccessibilityInput<TOptions>
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
}

export type SemanticLeafComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TAction = never,
  TPart extends string = never
> = ComponentDefinitionBase<TOptions, TPart>
  & SemanticDefinition<TOptions, TAction>
  & {
    readonly structure: 'leaf';
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TOptions, TPart>
    ) => void;
  };

export type DecorativeLeafComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TPart extends string = never
> = ComponentDefinitionBase<TOptions, TPart>
  & DecorativeDefinition
  & {
    readonly structure: 'leaf';
    readonly render: (
      this: undefined,
      input: ComponentRenderInput<TOptions, TPart>
    ) => void;
  };

export type SemanticCompositeComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TAction = never,
  TPart extends string = never
> = ComponentDefinitionBase<TOptions, TPart>
  & SemanticDefinition<TOptions, TAction>
  & {
    readonly structure: 'composite';
    readonly clipChildren?: boolean;
    readonly layout: (
      this: undefined,
      input: ComponentLayoutInput<TOptions>
    ) => readonly Rect[];
    readonly renderBeforeChildren?: (
      this: undefined,
      input: ComponentRenderInput<TOptions, TPart>
    ) => void;
    readonly renderAfterChildren?: (
      this: undefined,
      input: ComponentRenderInput<TOptions, TPart>
    ) => void;
  };

export type ComponentDefinition<
  TOptions extends object = NoComponentOptions,
  TAction = never,
  TPart extends string = never
> =
  | SemanticLeafComponentDefinition<TOptions, TAction, TPart>
  | DecorativeLeafComponentDefinition<TOptions, TPart>
  | SemanticCompositeComponentDefinition<TOptions, TAction, TPart>;

type ComponentReservedOption =
  | 'id'
  | 'children'
  | 'state'
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

type SemanticComponentMeta<TPart extends string> = Omit<ElementMeta<TPart>, 'accessibility'> & {
  readonly accessibility?: AccessibleNode | (AccessibilityOptions & { readonly decorative?: false });
};

type DecorativeComponentMeta<TPart extends string> = Omit<ElementMeta<TPart>, 'accessibility' | 'focus'> & {
  readonly accessibility?: never;
  readonly focus?: never;
};

type ActionMapper<TAction, TMessage> = [TAction] extends [never]
  ? { readonly onAction?: never }
  : { readonly onAction: (action: TAction) => MessageResolution<TMessage> };

type SemanticInstanceOptions<
  TOptions extends object,
  TAction,
  TMessage,
  TPart extends string
> = ComponentOwnOptions<TOptions>
  & ActionMapper<TAction, TMessage>
  & {
    readonly id: string;
    readonly state?: ComponentState;
    readonly meta?: SemanticComponentMeta<TPart>;
  };

type DecorativeInstanceOptions<
  TOptions extends object,
  TPart extends string
> = ComponentOwnOptions<TOptions> & {
  readonly id: string;
  readonly meta?: DecorativeComponentMeta<TPart>;
  readonly state?: never;
  readonly onAction?: never;
};

type SemanticLeafComponent<
  TOptions extends object,
  TAction,
  TPart extends string
> = <const TMessage = never>(
  options: SemanticInstanceOptions<TOptions, TAction, TMessage, TPart>
) => Element<TMessage>;

type DecorativeLeafComponent<
  TOptions extends object,
  TPart extends string
> = (
  options: DecorativeInstanceOptions<TOptions, TPart>
) => Element;

type SemanticCompositeComponent<
  TOptions extends object,
  TAction,
  TPart extends string
> = <
  const TChildren extends ElementChildren,
  const TMessage = never
>(
  options: SemanticInstanceOptions<TOptions, TAction, TMessage, TPart>
    & { readonly children: TChildren }
) => Element<TMessage | ElementChildrenMessage<TChildren>>;

export function defineComponent<
  TOptions extends object = NoComponentOptions,
  TAction = never,
  const TPart extends string = never
>(
  definition: SemanticLeafComponentDefinition<TOptions, TAction, TPart>
): SemanticLeafComponent<TOptions, TAction, TPart>;
export function defineComponent<
  TOptions extends object = NoComponentOptions,
  const TPart extends string = never
>(
  definition: DecorativeLeafComponentDefinition<TOptions, TPart>
): DecorativeLeafComponent<TOptions, TPart>;
export function defineComponent<
  TOptions extends object = NoComponentOptions,
  TAction = never,
  const TPart extends string = never
>(
  definition: SemanticCompositeComponentDefinition<TOptions, TAction, TPart>
): SemanticCompositeComponent<TOptions, TAction, TPart>;
export function defineComponent(definition: unknown): unknown {
  assertDefinition(definition);
  const normalized = normalizeDefinition(definition);
  const runtime = runtimeDefinition(normalized);
  const component = (value: unknown): Element<unknown> => {
    assertComponentInstanceOptions(value, normalized);
    const decodedOptions = decodeComponentOptions(value, normalized);
    const state = normalized.semantics === 'decorative'
      ? emptyComponentState
      : normalizeComponentState(value.state);
    const toActionMessage = value.onAction;
    const behavior = componentBehaviorInput(decodedOptions, state);
    const children = normalized.structure === 'composite'
      ? toRenderNodes(value.children ?? [])
      : undefined;
    const meta = normalized.semantics === 'decorative'
      ? { ...value.meta, accessibility: { decorative: true as const } }
      : value.meta;
    return componentElementFromRenderNode<'component', unknown>({
      id: renderNodeId(value.id, normalized.name),
      kind: 'component',
      props: {
        options: decodedOptions,
        ...(toActionMessage === undefined ? {} : { toActionMessage })
      },
      definition: runtime,
      ...(Object.keys(state).length === 0 ? {} : { state }),
      ...(children === undefined ? {} : { children }),
      ...renderNodeInteraction({
        keys: normalized.semantics === 'semantic'
          ? mappedKeyBindings(normalized.keys?.call(undefined, behavior), toActionMessage)
          : undefined,
        onInput: normalized.semantics === 'semantic' && normalized.onInput !== undefined
          ? (text: string) => mapActionResolution(
              normalized.onInput?.call(undefined, { ...behavior, text }),
              toActionMessage
            )
          : undefined,
        onPaste: normalized.semantics === 'semantic' && normalized.onPaste !== undefined
          ? (text: string) => mapActionResolution(
              normalized.onPaste?.call(undefined, { ...behavior, text }),
              toActionMessage
            )
          : undefined,
        pointer: normalized.semantics === 'semantic' && normalized.pointer !== undefined
          ? {
              ...(normalized.pointer.state === undefined
                ? {}
                : { state: normalizedPointerState(normalized.pointer.state.call(undefined, behavior), normalized.name) }),
              onAction: (action: PointerInteractionAction) => mapActionResolution(
                normalized.pointer?.onAction.call(undefined, action, behavior),
                toActionMessage
              )
            }
          : undefined,
        meta
      })
    });
  };
  return Object.freeze(component);
}

interface ComponentInstanceOptions extends Record<string, unknown> {
  readonly id: string;
  readonly children?: ElementChildren;
  readonly state?: ComponentState;
  readonly onAction?: (action: unknown) => unknown;
  readonly meta?: ElementMeta;
}

interface NormalizedDefinitionBase {
  readonly name: ComponentDefinitionName;
  readonly parts: readonly string[];
  readonly decodeOptions?: (this: undefined, value: unknown) => Readonly<Record<string, unknown>>;
  readonly measure: (
    this: undefined,
    input: ComponentMeasureInput<Readonly<Record<string, unknown>>>
  ) => Measurement;
}

interface NormalizedSemanticDefinition extends NormalizedDefinitionBase {
  readonly semantics: 'semantic';
  readonly accessibility: (
    this: undefined,
    input: ComponentAccessibilityInput<Readonly<Record<string, unknown>>>
  ) => AccessibleNode;
  readonly focusTargets?: (
    this: undefined,
    input: ComponentInput<Readonly<Record<string, unknown>>>
  ) => readonly FocusTarget[];
  readonly hitTargets?: (
    this: undefined,
    input: ComponentInput<Readonly<Record<string, unknown>>>
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
  | (NormalizedDefinitionBase & {
      readonly semantics: 'decorative';
      readonly structure: 'leaf';
      readonly render: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
    })
  | (NormalizedSemanticDefinition & {
      readonly structure: 'leaf';
      readonly render: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
    })
  | (NormalizedSemanticDefinition & {
      readonly structure: 'composite';
      readonly clipChildren?: boolean;
      readonly layout: (
        this: undefined,
        input: ComponentLayoutInput<Readonly<Record<string, unknown>>>
      ) => readonly Rect[];
      readonly renderBeforeChildren?: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
      readonly renderAfterChildren?: (
        this: undefined,
        input: ComponentRenderInput<Readonly<Record<string, unknown>>>
      ) => void;
    });

const emptyComponentState: Readonly<ComponentState> = Object.freeze({});
const componentInstanceFields = new Set<ComponentReservedOption>([
  'id',
  'children',
  'state',
  'onAction',
  'meta',
  'keys',
  'onInput',
  'onPaste',
  'pointer'
]);

function normalizeDefinition(
  definition: ComponentDefinition<NoComponentOptions, unknown, string>
): NormalizedDefinition {
  const common = {
    name: definition.name,
    parts: Object.freeze([...(definition.parts ?? [])]),
    measure: definition.measure,
    ...(definition.decodeOptions === undefined ? {} : { decodeOptions: definition.decodeOptions })
  };
  if (definition.semantics === 'decorative') {
    return Object.freeze({
      ...common,
      structure: 'leaf' as const,
      semantics: 'decorative' as const,
      render: definition.render
    });
  }
  const interaction = {
    accessibility: definition.accessibility,
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
      render: definition.render
    });
  }
  return Object.freeze({
    ...common,
    structure: 'composite' as const,
    semantics: 'semantic' as const,
    ...interaction,
    ...(definition.clipChildren === undefined ? {} : { clipChildren: definition.clipChildren }),
    layout: definition.layout,
    ...(definition.renderBeforeChildren === undefined ? {} : { renderBeforeChildren: definition.renderBeforeChildren }),
    ...(definition.renderAfterChildren === undefined ? {} : { renderAfterChildren: definition.renderAfterChildren })
  });
}

function assertDefinition(
  value: unknown
): asserts value is ComponentDefinition<NoComponentOptions, unknown, string> {
  if (!isNonArrayObject(value)) throw new TypeError('Component definition must be an object.');
  const structure = value['structure'];
  const semantics = value['semantics'];
  if (structure !== 'leaf' && structure !== 'composite') {
    throw new TypeError('Component definition structure must be "leaf" or "composite".');
  }
  if (semantics !== 'semantic' && semantics !== 'decorative') {
    throw new TypeError('Component definition semantics must be "semantic" or "decorative".');
  }
  if (structure === 'composite' && semantics === 'decorative') {
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
    'parts',
    'decodeOptions',
    'structure',
    'semantics',
    'measure',
    ...(structure === 'leaf'
      ? ['render']
      : ['layout', 'clipChildren', 'renderBeforeChildren', 'renderAfterChildren']),
    ...(semantics === 'semantic'
      ? ['accessibility', 'focusTargets', 'hitTargets', 'keys', 'onInput', 'onPaste', 'pointer']
      : [])
  ]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) throw new TypeError(`Component definition contains unknown field "${unknown}".`);
  for (const hook of ['measure', structure === 'leaf' ? 'render' : 'layout']) {
    if (typeof value[hook] !== 'function') throw new TypeError(`Component definition requires ${hook}().`);
  }
  if (value['decodeOptions'] !== undefined && typeof value['decodeOptions'] !== 'function') {
    throw new TypeError('Component definition decodeOptions must be a function when provided.');
  }
  if (semantics === 'semantic' && typeof value['accessibility'] !== 'function') {
    throw new TypeError('Semantic component definition requires accessibility().');
  }
  for (const hook of [
    'renderBeforeChildren',
    'renderAfterChildren',
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
  if (value['clipChildren'] !== undefined && typeof value['clipChildren'] !== 'boolean') {
    throw new TypeError('Component definition clipChildren must be a boolean.');
  }
}

function runtimeDefinition(definition: NormalizedDefinition): RuntimeComponentDefinition {
  return Object.freeze({
    name: definition.name,
    renderer: adaptDefinition(definition)
  });
}

function adaptDefinition(definition: NormalizedDefinition): RenderNodeRenderer<unknown, 'component'> {
  const renderer: RenderNodeRenderer<unknown, 'component'> = {
    ...(definition.structure === 'composite' && definition.clipChildren === true ? { clipChildren: true } : {}),
    measure: (input) => definition.measure.call(undefined, {
      ...componentBaseInput(input.renderNode, input.theme, input.widthProfile),
      constraints: { width: input.bounds.width, height: input.bounds.height },
      childCount: input.childCount,
      measureChild: input.measureChild
    }),
    ...(definition.structure === 'leaf' ? {} : {
      layout: (input) => normalizeChildBounds(definition.layout.call(undefined, {
        ...componentInput(input.renderNode, input.bounds, input.viewport, input.theme, input.widthProfile),
        childCount: input.childCount,
        measureChild: input.measureChild
      }), input.bounds, input.childCount)
    }),
    render: (input) => {
      const renderInput = componentRenderInput(definition, input);
      if (definition.structure === 'leaf') {
        definition.render.call(undefined, renderInput);
        return;
      }
      definition.renderBeforeChildren?.call(undefined, renderInput);
      input.renderChildren();
      definition.renderAfterChildren?.call(undefined, renderInput);
    },
    ...(definition.semantics === 'decorative' ? {} : {
      accessibility: (input) => definition.accessibility.call(undefined, {
        ...componentInput(
          input.renderNode,
          input.layoutNode.bounds,
          input.layoutNode.viewport,
          input.theme,
          input.widthProfile
        ),
        id: input.id,
        focused: input.focused,
        ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
        children: input.children
      }),
      ...(definition.focusTargets === undefined ? {} : {
        focusTargets: (input) => definition.focusTargets?.call(undefined, componentInput(
          input.renderNode,
          input.bounds,
          input.viewport,
          input.theme,
          input.widthProfile
        )) ?? []
      }),
      ...(definition.hitTargets === undefined ? {} : {
        hitTargets: (input) => mapHitTargets(
          definition.hitTargets?.call(undefined, componentInput(
            input.renderNode,
            input.bounds,
            input.layoutNode.viewport,
            input.theme,
            input.widthProfile
          )) ?? [],
          actionMapper(input.renderNode)
        )
      })
    })
  };
  return Object.freeze(renderer);
}

function componentBaseInput(
  renderNode: { readonly props: { readonly options: Readonly<Record<string, unknown>> }; readonly state?: ComponentState },
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ComponentBaseInput<Readonly<Record<string, unknown>>> {
  return {
    options: renderNode.props.options,
    state: renderNode.state ?? emptyComponentState,
    theme,
    widthProfile
  };
}

function componentInput(
  renderNode: { readonly props: { readonly options: Readonly<Record<string, unknown>> }; readonly state?: ComponentState },
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ComponentInput<Readonly<Record<string, unknown>>> {
  return {
    ...componentBaseInput(renderNode, theme, widthProfile),
    bounds,
    viewport
  };
}

function componentRenderInput(
  definition: NormalizedDefinition,
  input: Parameters<RenderNodeRenderer<unknown, 'component'>['render']>[0]
): ComponentRenderInput<Readonly<Record<string, unknown>>> {
  return {
    ...componentInput(
      input.renderNode,
      input.layoutNode.bounds,
      input.layoutNode.viewport,
      input.theme,
      input.widthProfile
    ),
    target: input.buffer,
    focus: input.focus,
    ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
    ...componentHelpers(input.renderNode, definition)
  };
}

function componentHelpers(
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0],
  definition: NormalizedDefinition
): Pick<ComponentRenderInput<Readonly<Record<string, unknown>>>, 'style' | 'source'> {
  const declaredParts = new Set<string>(definition.parts);
  return {
    style(input) {
      if (input.part !== 'root' && !declaredParts.has(input.part)) {
        throw new TypeError(`Component "${definition.name}" requested undeclared style part "${input.part}".`);
      }
      return resolveRenderNodeStyle(renderNode, input);
    },
    source(input = {}) {
      return renderNodeFrameSource({
        ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
        kind: definition.name
      }, {
        rendererFamily: 'component',
        cellRole: 'content',
        ...input
      });
    }
  };
}

function decodeComponentOptions(
  value: ComponentInstanceOptions,
  definition: NormalizedDefinition
): Readonly<Record<string, unknown>> {
  const customEntries = Object.entries(value)
    .filter(([field]) => !componentInstanceFields.has(field as ComponentReservedOption));
  const custom = Object.freeze(Object.fromEntries(customEntries));
  if (definition.decodeOptions === undefined) {
    const field = customEntries[0]?.[0];
    if (field !== undefined) {
      throw new TypeError(`Component "${definition.name}" options contain unknown field "${field}".`);
    }
    return Object.freeze({});
  }
  const decoded = definition.decodeOptions.call(undefined, custom);
  if (!isNonArrayObject(decoded)) {
    throw new TypeError(`Component "${definition.name}" decodeOptions must return an object.`);
  }
  return Object.freeze({ ...decoded });
}

function assertComponentInstanceOptions(
  value: unknown,
  definition: NormalizedDefinition
): asserts value is ComponentInstanceOptions {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${definition.name}" options must be an object.`);
  }
  if (typeof value['id'] !== 'string' || value['id'].trim() === '') {
    throw new TypeError(`Component "${definition.name}" requires a non-empty id.`);
  }
  if (definition.structure === 'leaf' && value['children'] !== undefined) {
    throw new TypeError(`Component "${definition.name}" is a leaf and cannot contain children.`);
  }
  if (definition.structure === 'composite' && value['children'] === undefined) {
    throw new TypeError(`Component "${definition.name}" is composite and requires children.`);
  }
  if (value['meta'] !== undefined && !isNonArrayObject(value['meta'])) {
    throw new TypeError(`Component "${definition.name}" meta must be an object when provided.`);
  }
  for (const removedInstanceHandler of ['keys', 'onInput', 'onPaste', 'pointer'] as const) {
    if (value[removedInstanceHandler] !== undefined) {
      throw new TypeError(
        `Component "${definition.name}" ${removedInstanceHandler} behavior must be declared by the definition.`
      );
    }
  }
  if (definition.semantics === 'decorative') {
    if (value['state'] !== undefined
      || value['onAction'] !== undefined
      || isNonArrayObject(value['meta'])
        && (value['meta']['accessibility'] !== undefined || value['meta']['focus'] !== undefined)) {
      throw new TypeError(
        `Decorative component "${definition.name}" cannot define state, actions, focus, or accessibility options.`
      );
    }
    return;
  }
  assertComponentState(value['state'], definition.name);
  const actionful = definitionHasActions(definition);
  if (actionful && typeof value['onAction'] !== 'function') {
    throw new TypeError(`Component "${definition.name}" requires onAction to map its semantic actions.`);
  }
  if (!actionful && value['onAction'] !== undefined) {
    throw new TypeError(`Component "${definition.name}" does not define actions and cannot accept onAction.`);
  }
}

function definitionHasActions(
  definition: Extract<NormalizedDefinition, { readonly semantics: 'semantic' }>
): boolean {
  return definition.hitTargets !== undefined
    || definition.keys !== undefined
    || definition.onInput !== undefined
    || definition.onPaste !== undefined
    || definition.pointer !== undefined;
}

function componentBehaviorInput(
  options: Readonly<Record<string, unknown>>,
  state: Readonly<ComponentState>
): ComponentBehaviorInput<Readonly<Record<string, unknown>>> {
  return Object.freeze({ options, state });
}

function normalizeComponentState(value: unknown): Readonly<ComponentState> {
  if (value === undefined) return emptyComponentState;
  const typed = value as Readonly<Record<string, boolean>>;
  return Object.freeze({
    ...(typed['disabled'] === true ? { disabled: true } : {}),
    ...(typed['busy'] === true ? { busy: true } : {}),
    ...(typed['readOnly'] === true ? { readOnly: true } : {}),
    ...(typed['inert'] === true ? { inert: true } : {})
  });
}

function assertComponentState(value: unknown, name: string): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${name}" state must be an object when provided.`);
  }
  const unsupported = findUnsupportedField(value, new Set(elementStateFields));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${name}" state contains unknown field "${unsupported}".`);
  }
  for (const field of elementStateFields) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`Component "${name}" state.${field} must be a boolean.`);
    }
  }
}

function mappedKeyBindings(
  bindings: ElementKeyBindings<unknown> | undefined,
  mapper: ((action: unknown) => unknown) | undefined
): ElementKeyBindings<unknown> | undefined {
  if (bindings === undefined) return undefined;
  assertKeyBindings(bindings, 'Component definition keys');
  const named: Partial<Record<BindableKeyName, NonNullable<ElementKeyBindings<unknown>[BindableKeyName]>>> = {};
  for (const key of keyNames) {
    if (!isBindableKeyName(key)) continue;
    const handler = bindings[key];
    if (handler === undefined) continue;
    named[key] = (event) => mapActionResolution(handler(event), mapper);
  }
  const mapped: ElementKeyBindings<unknown> = {
    ...named,
    ...(bindings.triggers === undefined ? {} : {
      triggers: bindings.triggers.map((binding) => ({
        trigger: binding.trigger,
        onKey: (event) => mapActionResolution(binding.onKey(event), mapper)
      }))
    }),
    ...(bindings.text === undefined ? {} : {
      text: Object.fromEntries(Object.entries(bindings.text).map(([text, handler]) => [
        text,
        (event: Parameters<typeof handler>[0]) => mapActionResolution(handler(event), mapper)
      ]))
    })
  };
  return Object.freeze(mapped);
}

function mapHitTargets(
  targets: readonly HitTarget[],
  mapper: ((action: unknown) => unknown) | undefined
): readonly HitTarget[] {
  return targets.map((target) => ({
    ...target,
    message: (event) => mapActionResolution(target.message(event), mapper)
  }));
}

function mapActionResolution(
  action: unknown,
  mapper: ((value: unknown) => unknown) | undefined
): unknown {
  if (action === undefined) {
    throw new TypeError('Component action hook returned undefined. Return ignoreMessage() to ignore an event.');
  }
  if (isIgnoredMessage(action)) return action;
  if (mapper === undefined) {
    throw new TypeError('Component action cannot be emitted without an onAction mapper.');
  }
  const message = mapper(action);
  if (message === undefined) {
    throw new TypeError('Component onAction returned undefined. Return ignoreMessage() to ignore an action.');
  }
  return message;
}

function actionMapper(
  renderNode: { readonly props: { readonly toActionMessage?: (action: unknown) => unknown } }
): ((action: unknown) => unknown) | undefined {
  return renderNode.props.toActionMessage;
}

function assertKeyBindings(value: unknown, subject: string): asserts value is ElementKeyBindings<unknown> {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const bindable = new Set<string>(keyNames.filter((name) => name !== 'unknown'));
  for (const [key, handler] of Object.entries(value)) {
    if (key === 'triggers') {
      if (!Array.isArray(handler)) throw new TypeError(`${subject}.triggers must be an array.`);
      for (const [index, binding] of handler.entries()) {
        if (!isNonArrayObject(binding)) {
          throw new TypeError(`${subject}.triggers[${String(index)}] must be an object.`);
        }
        const unsupported = findUnsupportedField(binding, triggerBindingFields);
        if (unsupported !== undefined) {
          throw new TypeError(`${subject}.triggers[${String(index)}] contains unknown field "${unsupported}".`);
        }
        assertKeyInputTrigger(binding['trigger'], `${subject}.triggers[${String(index)}].trigger`);
        if (typeof binding['onKey'] !== 'function') {
          throw new TypeError(`${subject}.triggers[${String(index)}].onKey must be a function.`);
        }
      }
      continue;
    }
    if (key === 'text') {
      if (!isNonArrayObject(handler)) throw new TypeError(`${subject}.text must be an object.`);
      for (const [text, textHandler] of Object.entries(handler)) {
        if (typeof textHandler !== 'function') {
          throw new TypeError(`${subject}.text[${JSON.stringify(text)}] must be a function.`);
        }
      }
      continue;
    }
    if (!bindable.has(key)) throw new TypeError(`${subject} contains unknown binding "${key}".`);
    if (typeof handler !== 'function') throw new TypeError(`${subject}.${key} must be a function.`);
  }
}

const triggerBindingFields = new Set(['trigger', 'onKey']);
const keyTriggerFields = new Set(['kind', 'key', 'modifiers', 'eventType', 'location']);
const codePointTriggerFields = new Set(['kind', 'codePoint', 'source', 'modifiers', 'eventType', 'location']);
const physicalKeyTriggerFields = new Set(['kind', 'codePoint', 'modifiers', 'eventType', 'location']);
const modifierFields = new Set(['kind', 'ctrl', 'alt', 'shift', 'meta']);

function assertKeyInputTrigger(value: unknown, subject: string): asserts value is Extract<
  InputTrigger,
  { readonly kind: 'key' | 'codePoint' | 'physicalKey' }
> {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const kind = value['kind'];
  const fields = kind === 'key'
    ? keyTriggerFields
    : kind === 'codePoint'
      ? codePointTriggerFields
      : kind === 'physicalKey'
        ? physicalKeyTriggerFields
        : undefined;
  if (fields === undefined) {
    throw new TypeError(`${subject}.kind must be "key", "codePoint", or "physicalKey".`);
  }
  const unsupported = findUnsupportedField(value, fields);
  if (unsupported !== undefined) throw new TypeError(`${subject} contains unknown field "${unsupported}".`);
  if (kind === 'key') {
    if (!isStringMember(value['key'], keyNames) || value['key'] === 'unknown') {
      throw new TypeError(`${subject}.key must be a bindable key name.`);
    }
  } else if (!isUnicodeScalar(value['codePoint'])) {
    throw new TypeError(`${subject}.codePoint must be a Unicode scalar value.`);
  }
  if (kind === 'codePoint' && value['source'] !== undefined
    && value['source'] !== 'primary' && value['source'] !== 'shifted') {
    throw new TypeError(`${subject}.source must be "primary" or "shifted".`);
  }
  if (value['eventType'] !== undefined && !isStringMember(value['eventType'], keyEventTypes)) {
    throw new TypeError(`${subject}.eventType is unsupported.`);
  }
  if (value['location'] !== undefined && !isStringMember(value['location'], keyLocations)) {
    throw new TypeError(`${subject}.location is unsupported.`);
  }
  assertModifierTrigger(value['modifiers'], subject);
}

function assertModifierTrigger(value: unknown, subject: string): asserts value is KeyModifierTrigger | undefined {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject}.modifiers must be an object.`);
  const unsupported = findUnsupportedField(value, modifierFields);
  if (unsupported !== undefined) {
    throw new TypeError(`${subject}.modifiers contains unknown field "${unsupported}".`);
  }
  if (value['kind'] !== undefined && value['kind'] !== 'any' && value['kind'] !== 'exact') {
    throw new TypeError(`${subject}.modifiers.kind must be "any" or "exact".`);
  }
  if (value['kind'] === 'any' && Object.keys(value).some((field) => field !== 'kind')) {
    throw new TypeError(`${subject}.modifiers kind "any" cannot define modifier flags.`);
  }
  for (const field of ['ctrl', 'alt', 'shift', 'meta'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`${subject}.modifiers.${field} must be a boolean.`);
    }
  }
}

function assertPointerDefinition(value: unknown): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) throw new TypeError('Component definition pointer must be an object.');
  const unsupported = findUnsupportedField(value, new Set(['state', 'onAction']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component definition pointer contains unknown field "${unsupported}".`);
  }
  if (value['state'] !== undefined && typeof value['state'] !== 'function') {
    throw new TypeError('Component definition pointer.state must be a function when provided.');
  }
  if (typeof value['onAction'] !== 'function') {
    throw new TypeError('Component definition pointer requires onAction().');
  }
}

function normalizedPointerState(value: unknown, component: string): PointerInteractionState {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" pointer state must be an object.`);
  }
  const unsupported = findUnsupportedField(value, new Set(['hoveredTargetId', 'pressedTargetId']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" pointer state contains unknown field "${unsupported}".`);
  }
  for (const field of ['hoveredTargetId', 'pressedTargetId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`Component "${component}" pointer state.${field} must be a string.`);
    }
  }
  return Object.freeze({
    ...(typeof value['hoveredTargetId'] === 'string' ? { hoveredTargetId: value['hoveredTargetId'] } : {}),
    ...(typeof value['pressedTargetId'] === 'string' ? { pressedTargetId: value['pressedTargetId'] } : {})
  });
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

function isBindableKeyName(value: KeyName): value is BindableKeyName {
  return value !== 'unknown';
}

function isUnicodeScalar(value: unknown): boolean {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= 0x10ffff
    && !(Number(value) >= 0xd800 && Number(value) <= 0xdfff);
}
