import type {
  ElementKeyBindings,
  InteractiveElementOptions,
  ElementTextInputHandlers
} from '../element/metadata.ts';
import type { Element } from '../element/index.ts';
import { extensionElementFromRenderNode } from '../renderer/model/element.ts';
import type {
  FocusTarget,
  HitTarget,
  Measurement,
  RenderFocusRelation,
  RenderTarget
} from '../renderer/contracts.ts';
import type { RenderNodeRenderer } from '../renderer/model/renderer.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Rect } from '../geometry/types.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import { renderNodeId } from '../foundation/identity.ts';
import { renderNodeInteraction } from '../renderer/model/metadata.ts';
import {
  assertCustomExtensionRenderer,
  CUSTOM_ZERO_MEASUREMENT,
  customExtensionCanFocus
} from './custom-extension.ts';
import type {
  DecorativeExtensionMeta,
  SemanticExtensionMeta
} from './custom-extension.ts';

export interface CustomRendererMeasureInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface CustomRendererInput<TState> extends CustomRendererMeasureInput<TState> {
  readonly viewport: Rect;
}

export interface CustomRendererRenderInput<TState> extends CustomRendererInput<TState> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
}

export interface CustomRendererAccessibilityInput<TState> extends CustomRendererInput<TState> {
  readonly id: string;
  readonly focused: boolean;
  readonly focusedTargetId?: string;
}

interface CustomRendererVisual<TState> {
  readonly measure?: (this: undefined, input: CustomRendererMeasureInput<TState>) => Measurement;
  readonly render: (this: undefined, input: CustomRendererRenderInput<TState>) => void;
}

interface CustomRendererInteraction<TState, TMessage> {
  readonly focusTargets?: (this: undefined, input: CustomRendererInput<TState>) => readonly FocusTarget[];
  readonly hitTargets?: (this: undefined, input: CustomRendererInput<TState>) => readonly HitTarget<TMessage>[];
}

export interface CustomRenderer<TState = undefined, TMessage = never>
  extends CustomRendererVisual<TState>, CustomRendererInteraction<TState, TMessage> {
  readonly accessibility: (this: undefined, input: CustomRendererAccessibilityInput<TState>) => AccessibleNode;
}

export interface DecorativeCustomRenderer<TState = undefined>
  extends CustomRendererVisual<TState> {
  readonly accessibility?: never;
  readonly focusTargets?: never;
  readonly hitTargets?: never;
}

interface SemanticCustomElementOptionsBase<TMessage>
  extends Omit<InteractiveElementOptions<string, TMessage>, 'meta'>, ElementTextInputHandlers<TMessage> {
  readonly keys?: ElementKeyBindings<TMessage>;
}

interface DecorativeCustomElementOptionsBase {
  readonly id: string;
  readonly keys?: never;
  readonly onInput?: never;
  readonly onPaste?: never;
  readonly pointer?: never;
}

interface StatefulSemanticCustomElementOptions<TState, TMessage>
  extends SemanticCustomElementOptionsBase<TMessage> {
  readonly renderer: CustomRenderer<TState, TMessage>;
  readonly state: TState;
  readonly meta?: SemanticExtensionMeta;
}

interface StatefulDecorativeCustomElementOptions<TState>
  extends DecorativeCustomElementOptionsBase {
  readonly renderer: DecorativeCustomRenderer<TState>;
  readonly state: TState;
  readonly meta: DecorativeExtensionMeta;
}

export type StatefulCustomElementOptions<TState, TMessage = never> =
  | StatefulSemanticCustomElementOptions<TState, TMessage>
  | StatefulDecorativeCustomElementOptions<TState>;

interface StatelessSemanticCustomElementOptions<TMessage>
  extends SemanticCustomElementOptionsBase<TMessage> {
  readonly renderer: CustomRenderer<undefined, TMessage>;
  readonly state?: never;
  readonly meta?: SemanticExtensionMeta;
}

interface StatelessDecorativeCustomElementOptions
  extends DecorativeCustomElementOptionsBase {
  readonly renderer: DecorativeCustomRenderer;
  readonly state?: never;
  readonly meta: DecorativeExtensionMeta;
}

export type StatelessCustomElementOptions<TMessage = never> =
  | StatelessSemanticCustomElementOptions<TMessage>
  | StatelessDecorativeCustomElementOptions;

export type CustomElementOptions<TState = undefined, TMessage = never> =
  | StatefulCustomElementOptions<TState, TMessage>
  | StatelessCustomElementOptions<TMessage>;

export function custom<TState, const TMessage = never>(
  options: StatefulCustomElementOptions<TState, TMessage>
): Element<TMessage>;
export function custom<const TMessage = never>(
  options: StatelessCustomElementOptions<TMessage>
): Element<TMessage>;
export function custom<TState, const TMessage = never>(
  options: CustomElementOptions<TState, TMessage>
): Element<TMessage> {
  assertCustomExtensionRenderer(options.renderer, {
    name: 'Custom renderer',
    requiredHooks: ['render'],
    optionalHooks: ['measure', 'focusTargets', 'hitTargets'],
    accessibility: options.meta?.accessibility
  });
  const renderer = adaptCustomRenderer(
    options.renderer as
      | CustomRenderer<TState, TMessage>
      | DecorativeCustomRenderer<TState>,
    ('state' in options ? options.state : undefined) as TState
  );
  return extensionElementFromRenderNode<'custom', TMessage>({
    id: renderNodeId(options.id),
    kind: 'custom',
    props: {},
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

function adaptCustomRenderer<TState, TMessage>(
  renderer:
    | CustomRenderer<TState, TMessage>
    | DecorativeCustomRenderer<TState>,
  state: TState
): RenderNodeRenderer<TMessage, 'custom'> {
  const { measure, render, accessibility, focusTargets, hitTargets } = renderer;
  return {
    measure: ({ bounds, theme, widthProfile }) => measure?.call(undefined, {
      state,
      bounds,
      theme,
      widthProfile
    }) ?? CUSTOM_ZERO_MEASUREMENT,
    render: ({ layoutNode, buffer, theme, widthProfile, focus, focusedTargetId }) => {
      render.call(undefined, {
        state,
        bounds: layoutNode.bounds,
        viewport: layoutNode.viewport,
        target: buffer,
        theme,
        widthProfile,
        focus,
        ...(focusedTargetId === undefined ? {} : { focusedTargetId })
      });
    },
    ...(accessibility === undefined ? {} : {
      accessibility: ({ layoutNode, id, focused, focusedTargetId, theme, widthProfile }) => accessibility.call(undefined, {
        state,
        bounds: layoutNode.bounds,
        viewport: layoutNode.viewport,
        id,
        focused,
        ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
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
