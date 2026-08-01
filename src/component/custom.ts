import type { AccessibleNode } from '../accessibility/index.ts';
import type {
  Element,
  ElementChildren,
  ElementChildrenMessage
} from '../element/index.ts';
import type {
  ElementKeyBindings,
  ElementTextInputHandlers,
  InteractiveElementOptions
} from '../element/metadata.ts';
import { renderNodeId } from '../foundation/identity.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { Rect } from '../geometry/types.ts';
import {
  extensionElementFromRenderNode,
  toRenderNodes
} from '../renderer/model/element.ts';
import { renderNodeInteraction } from '../renderer/model/metadata.ts';
import type { RenderNodeRenderer } from '../renderer/model/renderer.ts';
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
import {
  renderNodeFrameSource
} from '../visual/source.ts';
import type { FrameCellSource } from '../visual/source.ts';
import {
  assertCustomExtensionRenderer
} from './custom-extension.ts';
import type {
  DecorativeExtensionMeta,
  SemanticExtensionMeta
} from './custom-extension.ts';

export type CustomStyleInput<TPart extends string> = RenderStyleInput<TPart>;
export type CustomSourceInput = RenderSourceInput;

interface CustomRendererBaseInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface CustomRendererInput<TState>
  extends CustomRendererBaseInput<TState> {
  readonly viewport: Rect;
}

export interface CustomRendererMeasureInput<TState>
  extends CustomRendererBaseInput<TState> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface CustomRendererLayoutInput<TState>
  extends CustomRendererInput<TState> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface CustomRendererRenderInput<
  TState,
  TPart extends string = string
> extends CustomRendererInput<TState> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
  readonly style: (input: CustomStyleInput<TPart>) => import('../visual/render.ts').TerminalStyle | undefined;
  readonly source: (input?: CustomSourceInput) => FrameCellSource;
}

export interface CustomRendererAccessibilityInput<TState>
  extends CustomRendererInput<TState> {
  readonly id: string;
  readonly focused: boolean;
  readonly focusedTargetId?: string;
  readonly children: readonly AccessibleNode[];
}

interface CustomRendererDefinition<
  TState,
  TPart extends string
> {
  readonly name: string;
  readonly parts: readonly TPart[];
  readonly measure: (
    this: undefined,
    input: CustomRendererMeasureInput<TState>
  ) => Measurement;
}

interface CustomRendererInteraction<
  TState,
  TMessage
> {
  readonly focusTargets?: (
    this: undefined,
    input: CustomRendererInput<TState>
  ) => readonly FocusTarget[];
  readonly hitTargets?: (
    this: undefined,
    input: CustomRendererInput<TState>
  ) => readonly HitTarget<TMessage>[];
}

export interface CustomLeafRenderer<
  TState = undefined,
  TMessage = never,
  TPart extends string = string
> extends CustomRendererDefinition<TState, TPart>,
    CustomRendererInteraction<TState, TMessage> {
  readonly kind: 'leaf';
  readonly render: (
    this: undefined,
    input: CustomRendererRenderInput<TState, TPart>
  ) => void;
  readonly accessibility: (
    this: undefined,
    input: CustomRendererAccessibilityInput<TState>
  ) => AccessibleNode;
}

export interface CustomCompositeRenderer<
  TState = undefined,
  TMessage = never,
  TPart extends string = string
> extends CustomRendererDefinition<TState, TPart>,
    CustomRendererInteraction<TState, TMessage> {
  readonly kind: 'composite';
  readonly clipChildren?: boolean;
  readonly layout: (
    this: undefined,
    input: CustomRendererLayoutInput<TState>
  ) => readonly Rect[];
  readonly renderBeforeChildren?: (
    this: undefined,
    input: CustomRendererRenderInput<TState, TPart>
  ) => void;
  readonly renderAfterChildren?: (
    this: undefined,
    input: CustomRendererRenderInput<TState, TPart>
  ) => void;
  readonly accessibility: (
    this: undefined,
    input: CustomRendererAccessibilityInput<TState>
  ) => AccessibleNode;
}

export type CustomRenderer<
  TState = undefined,
  TMessage = never,
  TPart extends string = string
> =
  | CustomLeafRenderer<TState, TMessage, TPart>
  | CustomCompositeRenderer<TState, TMessage, TPart>;

interface DecorativeRendererDefinition<
  TState,
  TPart extends string
> extends CustomRendererDefinition<TState, TPart> {
  readonly accessibility?: never;
  readonly focusTargets?: never;
  readonly hitTargets?: never;
}

export interface DecorativeCustomLeafRenderer<
  TState = undefined,
  TPart extends string = string
> extends DecorativeRendererDefinition<TState, TPart> {
  readonly kind: 'leaf';
  readonly render: (
    this: undefined,
    input: CustomRendererRenderInput<TState, TPart>
  ) => void;
}

export interface DecorativeCustomCompositeRenderer<
  TState = undefined,
  TPart extends string = string
> extends DecorativeRendererDefinition<TState, TPart> {
  readonly kind: 'composite';
  readonly clipChildren?: boolean;
  readonly layout: (
    this: undefined,
    input: CustomRendererLayoutInput<TState>
  ) => readonly Rect[];
  readonly renderBeforeChildren?: (
    this: undefined,
    input: CustomRendererRenderInput<TState, TPart>
  ) => void;
  readonly renderAfterChildren?: (
    this: undefined,
    input: CustomRendererRenderInput<TState, TPart>
  ) => void;
}

export type DecorativeCustomRenderer<
  TState = undefined,
  TPart extends string = string
> =
  | DecorativeCustomLeafRenderer<TState, TPart>
  | DecorativeCustomCompositeRenderer<TState, TPart>;

interface SemanticOptionsBase<TPart extends string, TMessage>
  extends Omit<InteractiveElementOptions<TPart, TMessage>, 'meta'>,
    ElementTextInputHandlers<TMessage> {
  readonly keys?: ElementKeyBindings<TMessage>;
  readonly meta?: SemanticExtensionMeta<TPart>;
}

interface DecorativeOptionsBase<TPart extends string> {
  readonly id: string;
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly pointer?: never;
  readonly meta: DecorativeExtensionMeta<TPart>;
}

interface LeafChildren {
  readonly children?: never;
}

interface CompositeChildren<TChildren extends ElementChildren> {
  readonly children: TChildren;
}

export type StatefulCustomElementOptions<
  TState,
  TChildren extends ElementChildren = ElementChildren,
  TMessage = never,
  TPart extends string = string
> =
  | (SemanticOptionsBase<TPart, TMessage> & {
      readonly renderer: CustomLeafRenderer<TState, TMessage, TPart>;
      readonly state: TState;
    } & LeafChildren)
  | (SemanticOptionsBase<TPart, TMessage> & {
      readonly renderer: CustomCompositeRenderer<TState, TMessage, TPart>;
      readonly state: TState;
    } & CompositeChildren<TChildren>)
  | (DecorativeOptionsBase<TPart> & {
      readonly renderer: DecorativeCustomLeafRenderer<TState, TPart>;
      readonly state: TState;
    } & LeafChildren)
  | (DecorativeOptionsBase<TPart> & {
      readonly renderer: DecorativeCustomCompositeRenderer<TState, TPart>;
      readonly state: TState;
    } & CompositeChildren<TChildren>);

export type StatelessCustomElementOptions<
  TChildren extends ElementChildren = ElementChildren,
  TMessage = never,
  TPart extends string = string
> =
  | (SemanticOptionsBase<TPart, TMessage> & {
      readonly renderer: CustomLeafRenderer<undefined, TMessage, TPart>;
      readonly state?: never;
    } & LeafChildren)
  | (SemanticOptionsBase<TPart, TMessage> & {
      readonly renderer: CustomCompositeRenderer<undefined, TMessage, TPart>;
      readonly state?: never;
    } & CompositeChildren<TChildren>)
  | (DecorativeOptionsBase<TPart> & {
      readonly renderer: DecorativeCustomLeafRenderer<undefined, TPart>;
      readonly state?: never;
    } & LeafChildren)
  | (DecorativeOptionsBase<TPart> & {
      readonly renderer: DecorativeCustomCompositeRenderer<undefined, TPart>;
      readonly state?: never;
    } & CompositeChildren<TChildren>);

export type CustomElementOptions<
  TState = undefined,
  TChildren extends ElementChildren = ElementChildren,
  TMessage = never,
  TPart extends string = string
> =
  | StatefulCustomElementOptions<TState, TChildren, TMessage, TPart>
  | StatelessCustomElementOptions<TChildren, TMessage, TPart>;

export function custom<
  TState,
  const TChildren extends ElementChildren,
  const TMessage = never,
  const TPart extends string = string
>(
  options: StatefulCustomElementOptions<TState, TChildren, TMessage, TPart>
): Element<TMessage | ElementChildrenMessage<TChildren>>;
export function custom<
  const TChildren extends ElementChildren,
  const TMessage = never,
  const TPart extends string = string
>(
  options: StatelessCustomElementOptions<TChildren, TMessage, TPart>
): Element<TMessage | ElementChildrenMessage<TChildren>>;
export function custom<
  TState,
  const TChildren extends ElementChildren,
  const TMessage = never,
  const TPart extends string = string
>(
  options: CustomElementOptions<TState, TChildren, TMessage, TPart>
): Element<TMessage | ElementChildrenMessage<TChildren>> {
  const renderer = options.renderer as
    | CustomRenderer<TState | undefined, TMessage, TPart>
    | DecorativeCustomRenderer<TState | undefined, TPart>;
  assertRenderer(renderer, options.meta?.accessibility);
  const children = renderer.kind === 'composite'
    ? toRenderNodes((options as { readonly children: TChildren }).children)
    : undefined;
  const state = 'state' in options ? options.state : undefined;
  return extensionElementFromRenderNode<'custom', TMessage | ElementChildrenMessage<TChildren>>({
    id: renderNodeId(options.id),
    kind: 'custom',
    props: {},
    ...(children === undefined ? {} : { children }),
    custom: {
      name: renderer.name,
      renderer: adaptCustomRenderer(renderer, state)
    },
    ...renderNodeInteraction({
      keys: options.keys,
      onInput: options.onInput,
      onPaste: options.onPaste,
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

function assertRenderer(
  renderer: object,
  accessibility: SemanticExtensionMeta['accessibility'] | DecorativeExtensionMeta['accessibility'] | undefined
): void {
  const kind = isNonArrayObject(renderer) ? renderer['kind'] : undefined;
  if (kind !== 'leaf' && kind !== 'composite') {
    throw new TypeError('Custom renderer kind must be "leaf" or "composite".');
  }
  if ('place' in renderer) {
    throw new TypeError(
      'Custom renderer must omit the unsupported place field; compose placement with layout primitives.'
    );
  }
  if (kind === 'composite' && 'render' in renderer) {
    throw new TypeError(
      'Custom composite renderer must omit the leaf-only render field; use renderBeforeChildren or renderAfterChildren.'
    );
  }
  if (kind === 'leaf') {
    for (const field of ['layout', 'renderBeforeChildren', 'renderAfterChildren', 'clipChildren']) {
      if (field in renderer) {
        throw new TypeError(`Custom leaf renderer must omit the composite-only ${field} field.`);
      }
    }
  }
  assertCustomExtensionRenderer(renderer, {
    name: 'Custom renderer',
    requiredHooks: kind === 'leaf'
      ? ['measure', 'render']
      : ['measure', 'layout'],
    optionalHooks: kind === 'leaf'
      ? ['focusTargets', 'hitTargets']
      : [
          'renderBeforeChildren',
          'renderAfterChildren',
          'focusTargets',
          'hitTargets'
        ],
    accessibility
  });
  if (kind === 'composite'
    && isNonArrayObject(renderer)
    && renderer['clipChildren'] !== undefined
    && typeof renderer['clipChildren'] !== 'boolean') {
    throw new TypeError('Custom composite renderer clipChildren must be a boolean.');
  }
}

function adaptCustomRenderer<TState, TMessage, TPart extends string>(
  renderer:
    | CustomRenderer<TState, TMessage, TPart>
    | DecorativeCustomRenderer<TState, TPart>,
  state: TState
): RenderNodeRenderer<TMessage, 'custom'> {
  const {
    measure,
    accessibility,
    focusTargets,
    hitTargets
  } = renderer;
  return {
    ...(renderer.kind === 'composite' && renderer.clipChildren === true
      ? { clipChildren: true }
      : {}),
    measure: ({
      bounds,
      theme,
      widthProfile,
      childCount,
      measureChild
    }) => measure.call(undefined, {
      state,
      bounds,
      theme,
      widthProfile,
      childCount,
      measureChild
    }),
    ...(renderer.kind === 'leaf' ? {} : {
      layout: ({
        bounds,
        viewport,
        theme,
        widthProfile,
        childCount,
        measureChild
      }) => normalizeChildBounds(renderer.layout.call(undefined, {
        state,
        bounds,
        viewport,
        theme,
        widthProfile,
        childCount,
        measureChild
      }), bounds, childCount)
    }),
    render: (input) => {
      const customInput = renderInput(renderer, state, input);
      if (renderer.kind === 'leaf') {
        renderer.render.call(undefined, customInput);
        return;
      }
      renderer.renderBeforeChildren?.call(undefined, customInput);
      input.renderChildren();
      renderer.renderAfterChildren?.call(undefined, customInput);
    },
    ...(accessibility === undefined ? {} : {
      accessibility: (input) => {
        return accessibility.call(undefined, {
          state,
          bounds: input.layoutNode.bounds,
          viewport: input.layoutNode.viewport,
          id: input.id,
          focused: input.focused,
          ...(input.focusedTargetId === undefined
            ? {}
            : { focusedTargetId: input.focusedTargetId }),
          children: input.children,
          theme: input.theme,
          widthProfile: input.widthProfile
        });
      }
    }),
    ...(focusTargets === undefined ? {} : {
      focusTargets: (input) => focusTargets.call(undefined, {
        state,
        bounds: input.bounds,
        viewport: input.viewport,
        theme: input.theme,
        widthProfile: input.widthProfile
      })
    }),
    ...(hitTargets === undefined ? {} : {
      hitTargets: (input) => hitTargets.call(undefined, {
        state,
        bounds: input.bounds,
        viewport: input.layoutNode.viewport,
        theme: input.theme,
        widthProfile: input.widthProfile
      })
    })
  };
}

function renderInput<TState, TPart extends string>(
  renderer:
    | CustomRenderer<TState, unknown, TPart>
    | DecorativeCustomRenderer<TState, TPart>,
  state: TState,
  input: Parameters<RenderNodeRenderer<unknown, 'custom'>['render']>[0]
): CustomRendererRenderInput<TState, TPart> {
  return {
    state,
    bounds: input.layoutNode.bounds,
    viewport: input.layoutNode.viewport,
    target: input.buffer,
    theme: input.theme,
    widthProfile: input.widthProfile,
    focus: input.focus,
    ...(input.focusedTargetId === undefined
      ? {}
      : { focusedTargetId: input.focusedTargetId }),
    ...customHelpers(input.renderNode, renderer.parts)
  };
}

function customHelpers<TPart extends string>(
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0],
  parts: readonly TPart[]
): Pick<CustomRendererRenderInput<unknown, TPart>, 'style' | 'source'> {
  const declaredParts = new Set<string>(parts);
  return {
    style(input) {
      if (input.part !== 'root' && !declaredParts.has(input.part)) {
        throw new TypeError(
          `Custom renderer "${renderNode.kind === 'custom' ? renderNode.custom.name : renderNode.kind}" requested undeclared style part "${input.part}".`
        );
      }
      return resolveRenderNodeStyle(renderNode, input);
    },
    source(input = {}) {
      const name = renderNode.kind === 'custom'
        ? renderNode.custom.name
        : renderNode.kind;
      return renderNodeFrameSource({
        ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
        kind: name
      }, {
        rendererFamily: 'extension',
        cellRole: 'custom',
        ...input
      });
    }
  };
}

function normalizeChildBounds(
  values: unknown,
  parent: Rect,
  childCount: number
): readonly Rect[] {
  if (!Array.isArray(values)) {
    throw new TypeError('Custom composite layout must return an array of child bounds.');
  }
  if (values.length !== childCount) {
    throw new RangeError(
      `Custom composite layout returned ${String(values.length)} bounds for ${String(childCount)} children.`
    );
  }
  return Object.freeze(values.map((value, index) => {
    if (!rectHasValidCoordinates(value) || !rectFits(value, parent)) {
      throw new RangeError(
        `Custom composite child ${String(index)} returned bounds outside its parent.`
      );
    }
    return Object.freeze({ ...value });
  }));
}

function rectHasValidCoordinates(value: unknown): value is Rect {
  return isNonArrayObject(value)
    && typeof value['row'] === 'number'
    && Number.isSafeInteger(value['row'])
    && typeof value['column'] === 'number'
    && Number.isSafeInteger(value['column'])
    && typeof value['width'] === 'number'
    && Number.isSafeInteger(value['width'])
    && value['width'] >= 0
    && typeof value['height'] === 'number'
    && Number.isSafeInteger(value['height'])
    && value['height'] >= 0;
}

function rectFits(value: Rect, parent: Rect): boolean {
  return value.row >= parent.row
    && value.column >= parent.column
    && value.row + value.height <= parent.row + parent.height
    && value.column + value.width <= parent.column + parent.width;
}
