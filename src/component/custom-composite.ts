import { renderNodeId } from '../foundation/identity.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import { extensionElementFromRenderNode, toRenderNodes } from '../renderer/model/element.ts';
import { renderNodeInteraction } from '../renderer/model/metadata.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementKeyBindings,
  ElementTextInputHandlers,
  InteractiveElementOptions
} from '../element/index.ts';
import type { Rect } from '../geometry/types.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type {
  FocusTarget,
  HitTarget,
  Measurement,
  RenderFocusRelation,
  RenderTarget
} from '../renderer/contracts.ts';
import type { RenderNodeRenderer } from '../renderer/model/renderer.ts';
import type { TextWidthProfile } from '../text/index.ts';
import {
  assertCustomExtensionRenderer,
  CUSTOM_ZERO_MEASUREMENT,
  customExtensionCanFocus
} from './custom-extension.ts';
import type {
  DecorativeExtensionMeta,
  SemanticExtensionMeta
} from './custom-extension.ts';

interface CustomCompositeMeasureBaseInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface CustomCompositeInput<TState> extends CustomCompositeMeasureBaseInput<TState> {
  readonly viewport: Rect;
}

export interface CustomCompositeMeasureInput<TState> extends CustomCompositeMeasureBaseInput<TState> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface CustomCompositeLayoutInput<TState> extends CustomCompositeInput<TState> {
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface CustomCompositeRenderInput<TState> extends CustomCompositeInput<TState> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
}

export interface CustomCompositeAccessibilityInput<TState> extends CustomCompositeInput<TState> {
  readonly id: string;
  readonly focused: boolean;
  readonly focusedTargetId?: string;
  readonly children: readonly AccessibleNode[];
}

interface CustomCompositeRendererVisual<TState> {
  readonly measure?: (this: undefined, input: CustomCompositeMeasureInput<TState>) => Measurement;
  readonly layout: (this: undefined, input: CustomCompositeLayoutInput<TState>) => readonly Rect[];
  readonly render?: (this: undefined, input: CustomCompositeRenderInput<TState>) => void;
}

interface CustomCompositeRendererInteraction<TState, TMessage> {
  readonly focusTargets?: (this: undefined, input: CustomCompositeInput<TState>) => readonly FocusTarget[];
  readonly hitTargets?: (this: undefined, input: CustomCompositeInput<TState>) => readonly HitTarget<TMessage>[];
}

export interface CustomCompositeRenderer<TState = undefined, TMessage = never>
  extends CustomCompositeRendererVisual<TState>, CustomCompositeRendererInteraction<TState, TMessage> {
  readonly accessibility: (this: undefined, input: CustomCompositeAccessibilityInput<TState>) => AccessibleNode;
}

export interface DecorativeCustomCompositeRenderer<TState = undefined>
  extends CustomCompositeRendererVisual<TState> {
  readonly accessibility?: never;
  readonly focusTargets?: never;
  readonly hitTargets?: never;
}

interface SemanticCustomCompositeOptionsBase<
  TChildren extends ElementChildren,
  TMessage
> extends Omit<InteractiveElementOptions<string, TMessage>, 'meta'>, ElementTextInputHandlers<TMessage> {
  readonly children: TChildren;
  readonly keys?: ElementKeyBindings<TMessage>;
}

interface DecorativeCustomCompositeOptionsBase<TChildren extends ElementChildren> {
  readonly id: string;
  readonly children: TChildren;
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly pointer?: never;
}

interface StatefulSemanticCustomCompositeOptions<
  TState,
  TChildren extends ElementChildren,
  TMessage
> extends SemanticCustomCompositeOptionsBase<TChildren, TMessage> {
  readonly renderer: CustomCompositeRenderer<TState, TMessage>;
  readonly state: TState;
  readonly meta?: SemanticExtensionMeta;
}

interface StatefulDecorativeCustomCompositeOptions<
  TState,
  TChildren extends ElementChildren
> extends DecorativeCustomCompositeOptionsBase<TChildren> {
  readonly renderer: DecorativeCustomCompositeRenderer<TState>;
  readonly state: TState;
  readonly meta: DecorativeExtensionMeta;
}

export type StatefulCustomCompositeOptions<
  TState,
  TChildren extends ElementChildren,
  TMessage = never
> =
  | StatefulSemanticCustomCompositeOptions<TState, TChildren, TMessage>
  | StatefulDecorativeCustomCompositeOptions<TState, TChildren>;

interface StatelessSemanticCustomCompositeOptions<
  TChildren extends ElementChildren,
  TMessage
> extends SemanticCustomCompositeOptionsBase<TChildren, TMessage> {
  readonly renderer: CustomCompositeRenderer<undefined, TMessage>;
  readonly state?: never;
  readonly meta?: SemanticExtensionMeta;
}

interface StatelessDecorativeCustomCompositeOptions<
  TChildren extends ElementChildren
> extends DecorativeCustomCompositeOptionsBase<TChildren> {
  readonly renderer: DecorativeCustomCompositeRenderer;
  readonly state?: never;
  readonly meta: DecorativeExtensionMeta;
}

export type StatelessCustomCompositeOptions<
  TChildren extends ElementChildren,
  TMessage = never
> =
  | StatelessSemanticCustomCompositeOptions<TChildren, TMessage>
  | StatelessDecorativeCustomCompositeOptions<TChildren>;

export function customComposite<
  TState,
  const TChildren extends ElementChildren,
  const TMessage = never
>(
  options: StatefulCustomCompositeOptions<TState, TChildren, TMessage>
): Element<TMessage | ElementChildrenMessage<TChildren>>;
export function customComposite<
  const TChildren extends ElementChildren,
  const TMessage = never
>(
  options: StatelessCustomCompositeOptions<TChildren, TMessage>
): Element<TMessage | ElementChildrenMessage<TChildren>>;
export function customComposite<
  TState,
  const TChildren extends ElementChildren,
  const TMessage = never
>(
  options:
    | StatefulCustomCompositeOptions<TState, TChildren, TMessage>
    | StatelessCustomCompositeOptions<TChildren, TMessage>
): Element<TMessage | ElementChildrenMessage<TChildren>> {
  assertCustomExtensionRenderer(options.renderer, {
    name: 'Custom composite renderer',
    requiredHooks: ['layout'],
    optionalHooks: ['measure', 'render', 'focusTargets', 'hitTargets'],
    accessibility: options.meta?.accessibility
  });
  const children = toRenderNodes(options.children);
  const renderer = adaptCustomCompositeRenderer(
    options.renderer as
      | CustomCompositeRenderer<TState | undefined, TMessage>
      | DecorativeCustomCompositeRenderer<TState | undefined>,
    'state' in options ? options.state : undefined
  );
  return extensionElementFromRenderNode<'custom', TMessage | ElementChildrenMessage<TChildren>>({
    id: renderNodeId(options.id),
    kind: 'custom',
    props: {},
    children,
    custom: { renderer },
    ...renderNodeInteraction({
      keys: options.keys,
      onInput: options.onInput,
      onPaste: options.onPaste,
      pointer: options.pointer,
      meta: options.meta
    })
  }, customExtensionCanFocus(options.renderer, options));
}

function adaptCustomCompositeRenderer<TState, TMessage>(
  renderer:
    | CustomCompositeRenderer<TState, TMessage>
    | DecorativeCustomCompositeRenderer<TState>,
  state: TState
): RenderNodeRenderer<TMessage, 'custom'> {
  const { measure, layout, render, accessibility, focusTargets, hitTargets } = renderer;
  return {
    measure: ({ bounds, theme, widthProfile, childCount: measuredChildCount, measureChild }) =>
      measure?.call(undefined, {
        state,
        bounds,
        theme,
        widthProfile,
        childCount: measuredChildCount,
        measureChild
      })
        ?? CUSTOM_ZERO_MEASUREMENT,
    layout: ({ bounds, viewport, theme, widthProfile, childCount: measuredChildCount, measureChild }) => normalizeChildBounds(
      layout.call(undefined, {
        state,
        bounds,
        viewport,
        theme,
        widthProfile,
        childCount: measuredChildCount,
        measureChild
      }),
      bounds,
      measuredChildCount
    ),
    render: ({ layoutNode, buffer, theme, widthProfile, focus, focusedTargetId, renderChildren }) => {
      render?.call(undefined, {
        state,
        bounds: layoutNode.bounds,
        viewport: layoutNode.viewport,
        target: buffer,
        theme,
        widthProfile,
        focus,
        ...(focusedTargetId === undefined ? {} : { focusedTargetId })
      });
      renderChildren();
    },
    ...(accessibility === undefined ? {} : {
      accessibility: ({ layoutNode, id, focused, focusedTargetId, children, theme, widthProfile }) => accessibility.call(undefined, {
        state,
        bounds: layoutNode.bounds,
        viewport: layoutNode.viewport,
        id,
        focused,
        ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
        children,
        theme,
        widthProfile
      })
    }),
    ...(focusTargets === undefined ? {} : {
      focusTargets: ({ bounds, viewport, theme, widthProfile }) => focusTargets.call(undefined, {
        state,
        bounds,
        viewport,
        theme,
        widthProfile
      })
    }),
    ...(hitTargets === undefined ? {} : {
      hitTargets: ({ bounds, layoutNode, theme, widthProfile }) => hitTargets.call(undefined, {
        state,
        bounds,
        viewport: layoutNode.viewport,
        theme,
        widthProfile
      })
    })
  };
}

function normalizeChildBounds(values: unknown, parent: Rect, childCount: number): readonly Rect[] {
  if (!Array.isArray(values)) {
    throw new TypeError('Custom composite layout must return an array of child bounds.');
  }
  if (values.length !== childCount) {
    throw new RangeError(`Custom composite layout returned ${String(values.length)} bounds for ${String(childCount)} children.`);
  }
  return Object.freeze(values.map((value, index) => {
    if (!rectHasValidCoordinates(value) || !rectFits(value, parent)) {
      throw new RangeError(`Custom composite child ${String(index)} returned bounds outside its parent.`);
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
