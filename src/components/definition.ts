import type { AccessibleNode, AccessibilityOptions } from '../accessibility/index.ts';
import type {
  Element,
  ElementChildren,
  ElementChildrenMessage
} from '../element/index.ts';
import type {
  ElementKeyBindings,
  ElementAvailability,
  ElementMeta,
  InteractiveElementOptions
} from '../element/metadata.ts';
import { elementAvailabilities } from '../element/metadata.ts';
import type {
  ComponentKeyBindingMessages,
  InferredElementKeyBindings
} from './internal/messages.ts';
import { renderNodeId } from '../foundation/identity.ts';
import {
  assertOptionalEnum,
  findUnsupportedField,
  isNonArrayObject
} from '../foundation/validation.ts';
import type { Rect } from '../geometry/types.ts';
import { keyNames } from '../input/types.ts';
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
import { renderNodeFrameSource } from '../visual/source.ts';
import type { FrameCellSource } from '../visual/source.ts';

export type ComponentStyleInput<TPart extends string> = RenderStyleInput<TPart>;
export type ComponentSourceInput = RenderSourceInput;
export type ComponentAvailability = ElementAvailability;

interface ComponentBaseInput<TModel> {
  readonly model: TModel;
  readonly availability: ComponentAvailability;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface ComponentInput<TModel> extends ComponentBaseInput<TModel> {
  readonly viewport: Rect;
}

export interface ComponentMeasureInput<TModel> extends ComponentBaseInput<TModel> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface ComponentLayoutInput<TModel> extends ComponentInput<TModel> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface ComponentRenderInput<TModel, TPart extends string = string>
  extends ComponentInput<TModel> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
  readonly style: (input: ComponentStyleInput<TPart>) => import('../visual/render.ts').TerminalStyle | undefined;
  readonly source: (input?: ComponentSourceInput) => FrameCellSource;
}

export interface ComponentAccessibilityInput<TModel> extends ComponentInput<TModel> {
  readonly id: string;
  readonly focused: boolean;
  readonly focusedTargetId?: string;
  readonly children: readonly AccessibleNode[];
}

interface ComponentDefinitionBase<TModel, TPart extends string> {
  readonly name: string;
  readonly parts?: readonly TPart[];
  readonly measure: (this: undefined, input: ComponentMeasureInput<TModel>) => Measurement;
}

interface InteractiveDefinition<TModel, TMessage> {
  readonly focusTargets?: (this: undefined, input: ComponentInput<TModel>) => readonly FocusTarget[];
  readonly hitTargets?: (this: undefined, input: ComponentInput<TModel>) => readonly HitTarget<TMessage>[];
}

interface SemanticDefinition<TModel, TMessage> extends InteractiveDefinition<TModel, TMessage> {
  readonly semantics: 'semantic';
  readonly accessibility: (
    this: undefined,
    input: ComponentAccessibilityInput<TModel>
  ) => AccessibleNode;
}

interface DecorativeDefinition {
  readonly semantics: 'decorative';
  readonly accessibility?: never;
  readonly focusTargets?: never;
  readonly hitTargets?: never;
}

export type SemanticLeafComponentDefinition<
  TModel = undefined,
  TMessage = never,
  TPart extends string = never
> = ComponentDefinitionBase<TModel, TPart> & SemanticDefinition<TModel, TMessage> & {
  readonly structure: 'leaf';
  readonly render: (this: undefined, input: ComponentRenderInput<TModel, TPart>) => void;
};

export type DecorativeLeafComponentDefinition<
  TModel = undefined,
  TPart extends string = never
> = ComponentDefinitionBase<TModel, TPart> & DecorativeDefinition & {
  readonly structure: 'leaf';
  readonly render: (this: undefined, input: ComponentRenderInput<TModel, TPart>) => void;
};

export type SemanticCompositeComponentDefinition<
  TModel = undefined,
  TMessage = never,
  TPart extends string = never
> = ComponentDefinitionBase<TModel, TPart> & SemanticDefinition<TModel, TMessage> & {
  readonly structure: 'composite';
  readonly clipChildren?: boolean;
  readonly layout: (
    this: undefined,
    input: ComponentLayoutInput<TModel>
  ) => readonly Rect[];
  readonly renderBeforeChildren?: (
    this: undefined,
    input: ComponentRenderInput<TModel, TPart>
  ) => void;
  readonly renderAfterChildren?: (
    this: undefined,
    input: ComponentRenderInput<TModel, TPart>
  ) => void;
};

export type ComponentDefinition<
  TModel = undefined,
  TMessage = never,
  TPart extends string = never
> =
  | SemanticLeafComponentDefinition<TModel, TMessage, TPart>
  | DecorativeLeafComponentDefinition<TModel, TPart>
  | SemanticCompositeComponentDefinition<TModel, TMessage, TPart>;

type ModelOption<TModel> = [TModel] extends [undefined]
  ? { readonly model?: never }
  : { readonly model: TModel };

type SemanticComponentMeta<TPart extends string> = Omit<ElementMeta<TPart>, 'accessibility'> & {
  readonly accessibility?: AccessibleNode | (AccessibilityOptions & { readonly decorative?: false });
};

type DecorativeComponentMeta<TPart extends string> = Omit<ElementMeta<TPart>, 'accessibility' | 'focus'> & {
  readonly accessibility?: never;
  readonly focus?: never;
};

interface ActiveComponentOptions<
  TPart extends string,
  TInputMessage,
  TPasteMessage,
  TKeys extends InferredElementKeyBindings | undefined,
  TPointerMessage
> {
  readonly availability?: 'active';
  readonly keys?: TKeys;
  readonly onInput?: (text: string) => TInputMessage;
  readonly onPaste?: (text: string) => TPasteMessage;
  readonly pointer?: InteractiveElementOptions<TPart, TPointerMessage>['pointer'];
}

interface UnavailableComponentOptions {
  readonly availability: 'passive' | 'disabled' | 'pending';
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly pointer?: never;
}

type SemanticInstanceBase<
  TModel,
  TPart extends string,
  TInputMessage,
  TPasteMessage,
  TKeys extends InferredElementKeyBindings | undefined,
  TPointerMessage
> =
  & ModelOption<TModel>
  & (
    | ActiveComponentOptions<TPart, TInputMessage, TPasteMessage, TKeys, TPointerMessage>
    | UnavailableComponentOptions
  )
  & {
    readonly id: string;
    readonly meta?: SemanticComponentMeta<TPart>;
  };

type DecorativeInstanceBase<TModel, TPart extends string> = ModelOption<TModel> & {
  readonly id: string;
  readonly meta?: DecorativeComponentMeta<TPart>;
  readonly availability?: never;
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly pointer?: never;
};

type SemanticLeafComponent<
  TModel,
  TDefinitionMessage,
  TPart extends string
> = <
  const TInputMessage = never,
  const TPasteMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined,
  const TPointerMessage = never
>(options: SemanticInstanceBase<
  TModel,
  TPart,
  TInputMessage,
  TPasteMessage,
  TKeys,
  TPointerMessage
>) => Element<
  | TDefinitionMessage
  | TInputMessage
  | TPasteMessage
  | ComponentKeyBindingMessages<TKeys>
  | TPointerMessage
>;

type DecorativeLeafComponent<TModel, TPart extends string> = (options: DecorativeInstanceBase<TModel, TPart>) => Element;

type SemanticCompositeComponent<
  TModel,
  TDefinitionMessage,
  TPart extends string
> = <
  const TChildren extends ElementChildren,
  const TInputMessage = never,
  const TPasteMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined,
  const TPointerMessage = never
>(options: SemanticInstanceBase<
  TModel,
  TPart,
  TInputMessage,
  TPasteMessage,
  TKeys,
  TPointerMessage
> & { readonly children: TChildren }) => Element<
  | TDefinitionMessage
  | TInputMessage
  | TPasteMessage
  | ComponentKeyBindingMessages<TKeys>
  | TPointerMessage
  | ElementChildrenMessage<TChildren>
>;

export function defineComponent<
  TModel = undefined,
  TMessage = never,
  const TPart extends string = never
>(definition: SemanticLeafComponentDefinition<TModel, TMessage, TPart>): SemanticLeafComponent<TModel, TMessage, TPart>;
export function defineComponent<
  TModel = undefined,
  const TPart extends string = never
>(definition: DecorativeLeafComponentDefinition<TModel, TPart>): DecorativeLeafComponent<TModel, TPart>;
export function defineComponent<
  TModel = undefined,
  TMessage = never,
  const TPart extends string = never
>(definition: SemanticCompositeComponentDefinition<TModel, TMessage, TPart>): SemanticCompositeComponent<TModel, TMessage, TPart>;
export function defineComponent(
  definition: unknown
): unknown {
  assertDefinition(definition);
  const normalized = normalizeDefinition(definition);
  const runtime = runtimeDefinition(normalized);
  const component = (value: unknown): Element<unknown> => {
    assertComponentInstanceOptions(value, normalized.name, normalized.semantics);
    const options = value;
    const children = normalized.structure === 'composite'
      ? toRenderNodes(options.children ?? [])
      : undefined;
    if (normalized.structure === 'leaf' && options.children !== undefined) {
      throw new TypeError(`Component "${normalized.name}" is a leaf and cannot contain children.`);
    }
    if (normalized.structure === 'composite' && options.children === undefined) {
      throw new TypeError(`Component "${normalized.name}" is composite and requires children.`);
    }
    const availability = options.availability ?? (normalized.semantics === 'decorative' ? 'passive' : 'active');
    if (availability !== 'active' && hasInteractionOptions(options)) {
      throw new TypeError(`Unavailable component "${normalized.name}" cannot define interaction handlers.`);
    }
    const meta = normalized.semantics === 'decorative'
      ? { ...options.meta, accessibility: { decorative: true as const } }
      : options.meta;
    return componentElementFromRenderNode<'component', unknown>({
      id: renderNodeId(options.id, normalized.name),
      kind: 'component',
      props: { model: options.model },
      definition: runtime,
      availability,
      ...(children === undefined ? {} : { children }),
      ...renderNodeInteraction({
        keys: options.keys,
        onInput: options.onInput,
        onPaste: options.onPaste,
        pointer: options.pointer,
        meta
      })
    });
  };
  return Object.freeze(component);
}

interface ComponentInstanceOptions {
  readonly id: string;
  readonly model?: unknown;
  readonly children?: ElementChildren;
  readonly availability?: ComponentAvailability;
  readonly keys?: ElementKeyBindings<unknown>;
  readonly onInput?: (text: string) => unknown;
  readonly onPaste?: (text: string) => unknown;
  readonly pointer?: InteractiveElementOptions<string, unknown>['pointer'];
  readonly meta?: ElementMeta;
}

type NormalizedDefinition = ComponentDefinition<unknown, unknown, string>;

function normalizeDefinition(definition: ComponentDefinition<unknown, unknown, string>): NormalizedDefinition {
  const parts = Object.freeze([...(definition.parts ?? [])]);
  if (definition.semantics === 'decorative') {
    return Object.freeze({
      name: definition.name,
      parts,
      structure: definition.structure,
      semantics: definition.semantics,
      measure: definition.measure,
      render: definition.render
    });
  }
  const interaction = {
    accessibility: definition.accessibility,
    ...(definition.focusTargets === undefined ? {} : { focusTargets: definition.focusTargets }),
    ...(definition.hitTargets === undefined ? {} : { hitTargets: definition.hitTargets })
  };
  if (definition.structure === 'leaf') {
    return Object.freeze({
      name: definition.name,
      parts,
      structure: definition.structure,
      semantics: definition.semantics,
      measure: definition.measure,
      render: definition.render,
      ...interaction
    });
  }
  return Object.freeze({
    name: definition.name,
    parts,
    structure: definition.structure,
    semantics: definition.semantics,
    measure: definition.measure,
    ...interaction,
    ...(definition.clipChildren === undefined ? {} : { clipChildren: definition.clipChildren }),
    layout: definition.layout,
    ...(definition.renderBeforeChildren === undefined ? {} : { renderBeforeChildren: definition.renderBeforeChildren }),
    ...(definition.renderAfterChildren === undefined ? {} : { renderAfterChildren: definition.renderAfterChildren })
  });
}

function assertDefinition(value: unknown): asserts value is ComponentDefinition<unknown, unknown, string> {
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
  if (typeof value['name'] !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value['name'])) {
    throw new TypeError('Component name must be a safe identifier starting with an ASCII letter.');
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
    'structure',
    'semantics',
    'measure',
    ...(structure === 'leaf'
      ? ['render']
      : ['layout', 'clipChildren', 'renderBeforeChildren', 'renderAfterChildren']),
    ...(semantics === 'semantic' ? ['accessibility', 'focusTargets', 'hitTargets'] : [])
  ]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) throw new TypeError(`Component definition contains unknown field "${unknown}".`);
  for (const hook of ['measure', structure === 'leaf' ? 'render' : 'layout']) {
    if (typeof value[hook] !== 'function') throw new TypeError(`Component definition requires ${hook}().`);
  }
  if (semantics === 'semantic' && value['accessibility'] === undefined) {
    throw new TypeError('Semantic component definition requires accessibility().');
  }
  if (semantics === 'semantic' && typeof value['accessibility'] !== 'function') {
    throw new TypeError('Component definition accessibility must be a function.');
  }
  for (const hook of ['renderBeforeChildren', 'renderAfterChildren', 'focusTargets', 'hitTargets']) {
    if (value[hook] !== undefined && typeof value[hook] !== 'function') {
      throw new TypeError(`Component definition ${hook} must be a function when provided.`);
    }
  }
  if (value['clipChildren'] !== undefined && typeof value['clipChildren'] !== 'boolean') {
    throw new TypeError('Component definition clipChildren must be a boolean.');
  }
}

function runtimeDefinition(definition: NormalizedDefinition): RuntimeComponentDefinition {
  const renderer = adaptDefinition(definition);
  return Object.freeze({
    name: definition.name,
    renderer
  });
}

function adaptDefinition(definition: NormalizedDefinition): RenderNodeRenderer<unknown, 'component'> {
  const renderer: RenderNodeRenderer<unknown, 'component'> = {
    ...(definition.structure === 'composite' && definition.clipChildren === true ? { clipChildren: true } : {}),
    measure: (input) => definition.measure.call(undefined, {
      model: model(input.renderNode),
      availability: componentAvailability(input.renderNode),
      bounds: input.bounds,
      theme: input.theme,
      widthProfile: input.widthProfile,
      childCount: input.childCount,
      measureChild: input.measureChild
    }),
    ...(definition.structure === 'leaf' ? {} : {
      layout: (input) => normalizeChildBounds(definition.layout.call(undefined, {
        model: model(input.renderNode),
        availability: componentAvailability(input.renderNode),
        bounds: input.bounds,
        viewport: input.viewport,
        theme: input.theme,
        widthProfile: input.widthProfile,
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
        model: model(input.renderNode),
        availability: componentAvailability(input.renderNode),
        bounds: input.layoutNode.bounds,
        viewport: input.layoutNode.viewport,
        id: input.id,
        focused: input.focused,
        ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
        children: input.children,
        theme: input.theme,
        widthProfile: input.widthProfile
      }),
      ...(definition.focusTargets === undefined ? {} : {
        focusTargets: (input) => definition.focusTargets?.call(undefined, {
          model: model(input.renderNode),
          availability: componentAvailability(input.renderNode),
          bounds: input.bounds,
          viewport: input.viewport,
          theme: input.theme,
          widthProfile: input.widthProfile
        }) ?? []
      }),
      ...(definition.hitTargets === undefined ? {} : {
        hitTargets: (input) => definition.hitTargets?.call(undefined, {
          model: model(input.renderNode),
          availability: componentAvailability(input.renderNode),
          bounds: input.bounds,
          viewport: input.layoutNode.viewport,
          theme: input.theme,
          widthProfile: input.widthProfile
        }) ?? []
      })
    })
  };
  return Object.freeze(renderer);
}

function componentRenderInput(
  definition: NormalizedDefinition,
  input: Parameters<RenderNodeRenderer<unknown, 'component'>['render']>[0]
): ComponentRenderInput<unknown> {
  return {
    model: model(input.renderNode),
    availability: componentAvailability(input.renderNode),
    bounds: input.layoutNode.bounds,
    viewport: input.layoutNode.viewport,
    target: input.buffer,
    theme: input.theme,
    widthProfile: input.widthProfile,
    focus: input.focus,
    ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
    ...componentHelpers(input.renderNode, definition)
  };
}

function model(renderNode: { readonly props: { readonly model: unknown } }): unknown {
  return renderNode.props.model;
}

function componentAvailability(
  renderNode: { readonly availability?: ComponentAvailability }
): ComponentAvailability {
  return renderNode.availability ?? 'active';
}

function componentHelpers(
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0],
  definition: NormalizedDefinition
): Pick<ComponentRenderInput<unknown>, 'style' | 'source'> {
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

function hasInteractionOptions(options: ComponentInstanceOptions): boolean {
  return options.keys !== undefined
    || options.onInput !== undefined
    || options.onPaste !== undefined
    || options.pointer !== undefined;
}

const bindableKeyNames = new Set<string>(keyNames.filter((name) => name !== 'unknown'));
const componentInstanceFields = new Set([
  'id',
  'model',
  'children',
  'availability',
  'keys',
  'onInput',
  'onPaste',
  'pointer',
  'meta'
]);

function assertComponentInstanceOptions(
  value: unknown,
  component: string,
  semantics: NormalizedDefinition['semantics']
): asserts value is ComponentInstanceOptions {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" options must be an object.`);
  }
  const unsupported = findUnsupportedField(value, componentInstanceFields);
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" options contain unknown field "${unsupported}".`);
  }
  assertOptionalEnum(value['availability'], elementAvailabilities, `Component "${component}" availability`);
  assertOptionalHandler(value['onInput'], `Component "${component}" onInput`);
  assertOptionalHandler(value['onPaste'], `Component "${component}" onPaste`);
  assertKeyBindings(value['keys'], component);
  assertPointerOptions(value['pointer'], component);
  const meta = value['meta'];
  if (meta !== undefined && !isNonArrayObject(meta)) {
    throw new TypeError(`Component "${component}" meta must be an object when provided.`);
  }
  if (semantics === 'decorative' && (
    value['availability'] !== undefined
    || value['keys'] !== undefined
    || value['onInput'] !== undefined
    || value['onPaste'] !== undefined
    || value['pointer'] !== undefined
    || meta?.['accessibility'] !== undefined
    || meta?.['focus'] !== undefined
  )) {
    throw new TypeError(
      `Decorative component "${component}" cannot define availability, interaction, focus, or accessibility options.`
    );
  }
}

function assertOptionalHandler(value: unknown, subject: string): void {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${subject} must be a function when provided.`);
  }
}

function assertKeyBindings(value: unknown, component: string): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" keys must be an object when provided.`);
  }
  for (const [key, handler] of Object.entries(value)) {
    if (key === 'triggers') {
      if (!Array.isArray(handler)) {
        throw new TypeError(`Component "${component}" keys.triggers must be an array when provided.`);
      }
      for (const [index, binding] of handler.entries()) {
        if (!isNonArrayObject(binding) || !isNonArrayObject(binding['trigger'])) {
          throw new TypeError(`Component "${component}" keys.triggers[${String(index)}] must define a trigger object.`);
        }
        if (typeof binding['onKey'] !== 'function') {
          throw new TypeError(`Component "${component}" keys.triggers[${String(index)}].onKey must be a function.`);
        }
      }
      continue;
    }
    if (key === 'text') {
      if (!isNonArrayObject(handler)) {
        throw new TypeError(`Component "${component}" keys.text must be an object when provided.`);
      }
      for (const [text, textHandler] of Object.entries(handler)) {
        if (typeof textHandler !== 'function') {
          throw new TypeError(`Component "${component}" keys.text[${JSON.stringify(text)}] must be a function.`);
        }
      }
      continue;
    }
    if (!bindableKeyNames.has(key)) {
      throw new TypeError(`Component "${component}" keys contains unknown binding "${key}".`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`Component "${component}" keys.${key} must be a function.`);
    }
  }
}

function assertPointerOptions(value: unknown, component: string): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" pointer must be an object when provided.`);
  }
  assertOptionalHandler(value['onAction'], `Component "${component}" pointer.onAction`);
}
