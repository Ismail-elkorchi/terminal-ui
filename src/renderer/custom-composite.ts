import { renderNodeId } from '../foundation/identity.ts';
import { elementFromRenderNode, toRenderNodes } from './model/element.ts';
import { renderNodeInteraction } from './model/metadata.ts';
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
import type { Measurement } from './model/measurement.ts';
import type { FocusTarget, HitTarget, RenderFocusRelation, RenderNodeRenderer } from './model/renderer.ts';
import type { RenderTarget } from './model/render-target.ts';

interface CustomCompositeInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface CustomCompositeLayoutInput<TState> extends CustomCompositeInput<TState> {
  readonly viewport: Rect;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
}

export interface CustomCompositeRenderInput<TState> extends CustomCompositeInput<TState> {
  readonly buffer: RenderTarget;
  readonly focus: RenderFocusRelation;
}

export interface CustomCompositeAccessibilityInput<TState> extends CustomCompositeInput<TState> {
  readonly id: string;
  readonly focused: boolean;
}

export interface CustomCompositeRenderer<TState = undefined, TMessage = never> {
  readonly measure?: (input: CustomCompositeInput<TState>) => Measurement;
  readonly layout: (input: CustomCompositeLayoutInput<TState>) => readonly Rect[];
  readonly render?: (input: CustomCompositeRenderInput<TState>) => void;
  readonly accessibility: (input: CustomCompositeAccessibilityInput<TState>) => AccessibleNode;
  readonly focusTargets?: (input: CustomCompositeInput<TState>) => readonly FocusTarget[];
  readonly hitTargets?: (input: CustomCompositeInput<TState>) => readonly HitTarget<TMessage>[];
}

interface CustomCompositeOptionsBase<
  TChildren extends ElementChildren,
  TMessage
> extends InteractiveElementOptions<string, TMessage>, ElementTextInputHandlers<TMessage> {
  readonly children: TChildren;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface StatefulCustomCompositeOptions<
  TState,
  TChildren extends ElementChildren,
  TMessage = never
> extends CustomCompositeOptionsBase<TChildren, TMessage> {
  readonly renderer: CustomCompositeRenderer<TState, TMessage>;
  readonly state: TState;
}

export interface StatelessCustomCompositeOptions<
  TChildren extends ElementChildren,
  TMessage = never
> extends CustomCompositeOptionsBase<TChildren, TMessage> {
  readonly renderer: CustomCompositeRenderer<undefined, TMessage>;
  readonly state?: never;
}

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
  assertCustomCompositeRenderer(options.renderer);
  const children = toRenderNodes(options.children);
  const renderer = adaptCustomCompositeRenderer(
    options.renderer as CustomCompositeRenderer<TState | undefined, TMessage>,
    'state' in options ? options.state : undefined,
    children.length
  );
  return elementFromRenderNode<'custom', TMessage | ElementChildrenMessage<TChildren>>({
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
  });
}

function adaptCustomCompositeRenderer<TState, TMessage>(
  renderer: CustomCompositeRenderer<TState, TMessage>,
  state: TState,
  childCount: number
): RenderNodeRenderer<TMessage, 'custom'> {
  const render = renderer.render;
  return {
    ...(renderer.measure === undefined ? {} : {
      measure: ({ bounds, theme }) => renderer.measure?.({ state, bounds, theme }) ?? zeroMeasurement()
    }),
    layout: ({ bounds, viewport, theme, childCount: measuredChildCount, measureChild }) => normalizeChildBounds(
      renderer.layout({ state, bounds, viewport, theme, childCount: measuredChildCount, measureChild }),
      bounds,
      childCount
    ),
    render: ({ layoutNode, buffer, theme, focus, renderChildren }) => {
      render?.({ state, bounds: layoutNode.bounds, buffer, theme, focus });
      renderChildren();
    },
    accessibility: ({ layoutNode, id, focused, theme }) => renderer.accessibility({
      state,
      bounds: layoutNode.bounds,
      id,
      focused,
      theme
    }),
    ...(renderer.focusTargets === undefined ? {} : {
      focusTargets: ({ bounds, theme }) => renderer.focusTargets?.({ state, bounds, theme }) ?? []
    }),
    ...(renderer.hitTargets === undefined ? {} : {
      hitTargets: ({ bounds, theme }) => renderer.hitTargets?.({ state, bounds, theme }) ?? []
    })
  };
}

function assertCustomCompositeRenderer(value: unknown): asserts value is CustomCompositeRenderer<unknown, unknown> {
  if (!isRecord(value) || typeof value['layout'] !== 'function' || typeof value['accessibility'] !== 'function') {
    throw new TypeError('Custom composite renderers require layout and accessibility functions.');
  }
  for (const hook of ['measure', 'render', 'focusTargets', 'hitTargets'] as const) {
    if (value[hook] !== undefined && typeof value[hook] !== 'function') {
      throw new TypeError(`Custom composite renderer field "${hook}" must be a function.`);
    }
  }
}

function normalizeChildBounds(values: readonly Rect[], parent: Rect, childCount: number): readonly Rect[] {
  if (values.length !== childCount) {
    throw new RangeError(`Custom composite layout returned ${String(values.length)} bounds for ${String(childCount)} children.`);
  }
  return Object.freeze(values.map((value, index) => {
    if (!rectIsFiniteInteger(value) || !rectFits(value, parent)) {
      throw new RangeError(`Custom composite child ${String(index)} returned bounds outside its parent.`);
    }
    return Object.freeze({ ...value });
  }));
}

function rectIsFiniteInteger(value: Rect): boolean {
  return [value.row, value.column, value.width, value.height]
    .every((item) => Number.isSafeInteger(item) && item >= 0);
}

function rectFits(value: Rect, parent: Rect): boolean {
  return value.row >= parent.row
    && value.column >= parent.column
    && value.row + value.height <= parent.row + parent.height
    && value.column + value.width <= parent.column + parent.width;
}

function zeroMeasurement(): Measurement {
  return { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
