import type {
  ElementAccessibility,
  ElementKeyBindings,
  InteractiveElementOptions,
  ElementTextInputHandlers
} from '../element/metadata.ts';
import type { Element } from '../element/index.ts';
import { extensionElementFromRenderNode } from '../renderer/model/element.ts';
import type { RenderNodeInputMap } from '../renderer/model/index.ts';
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
import { isNonArrayObject } from '../foundation/validation.ts';
import { renderNodeInteraction } from '../renderer/model/metadata.ts';

export interface CustomRendererInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
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

export interface CustomRenderer<TState = undefined, TMessage = never> {
  measure?(input: CustomRendererInput<TState>): Measurement;
  render(input: CustomRendererRenderInput<TState>): void;
  accessibility?(input: CustomRendererAccessibilityInput<TState>): AccessibleNode;
  focusTargets?(input: CustomRendererInput<TState>): readonly FocusTarget[];
  hitTargets?(input: CustomRendererInput<TState>): readonly HitTarget<TMessage>[];
}

const rendererHookNames = [
  'measure',
  'accessibility',
  'focusTargets',
  'hitTargets'
] as const satisfies readonly (keyof CustomRenderer)[];

interface CustomElementOptionsBase<TMessage> extends InteractiveElementOptions<string, TMessage>, ElementTextInputHandlers<TMessage> {
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface StatefulCustomElementOptions<TState, TMessage = never> extends CustomElementOptionsBase<TMessage> {
  readonly renderer: CustomRenderer<TState, TMessage>;
  readonly state: TState;
}

export interface StatelessCustomElementOptions<TMessage = never> extends CustomElementOptionsBase<TMessage> {
  readonly renderer: CustomRenderer<undefined, TMessage>;
  readonly state?: never;
}

export type CustomElementOptions<TState = undefined, TMessage = never> =
  | StatefulCustomElementOptions<TState, TMessage>
  | StatelessCustomElementOptions<TMessage>;

interface CustomRendererValidationOptions<TMessage> {
  readonly accessibility?: ElementAccessibility;
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
}

export function custom<TState, const TMessage = never>(
  options: StatefulCustomElementOptions<TState, TMessage>
): Element<TMessage>;
export function custom<const TMessage = never>(
  options: StatelessCustomElementOptions<TMessage>
): Element<TMessage>;
export function custom<TState, const TMessage = never>(
  options: CustomElementOptions<TState, TMessage>
): Element<TMessage> {
  const inputMap = inputMapFromHandlers(options);
  assertCustomRenderer(options.renderer, {
    ...(options.meta?.accessibility === undefined ? {} : { accessibility: options.meta.accessibility }),
    ...(options.keys === undefined ? {} : { keyMap: options.keys }),
    ...(inputMap === undefined ? {} : { inputMap })
  });
  const renderer = adaptCustomRenderer(options.renderer, 'state' in options ? options.state : undefined);
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
  });
}

function assertCustomRenderer(
  value: unknown,
  options: CustomRendererValidationOptions<unknown>
): asserts value is CustomRenderer<unknown, unknown> {
  if (!isNonArrayObject(value) || typeof value['render'] !== 'function') {
    throw new Error('Custom renderers must provide a renderer with a render function.');
  }
  for (const hook of rendererHookNames) {
    const candidate = value[hook];
    if (candidate !== undefined && typeof candidate !== 'function') {
      throw new Error(`Custom renderer field "${hook}" must be a function.`);
    }
  }
  if (isDecorativeAccessibility(options.accessibility)) {
    assertDecorativeCustomRendererIsNotInteractive(value, options);
    return;
  }
  if (value['accessibility'] === undefined) {
    throw new Error('Custom renderers must provide accessibility or be marked decorative.');
  }
}

function adaptCustomRenderer<TState, TMessage>(
  renderer: CustomRenderer<TState, TMessage>,
  state: TState
): RenderNodeRenderer<TMessage, 'custom'> {
  const accessibility = renderer.accessibility?.bind(renderer);
  const focusTargets = renderer.focusTargets?.bind(renderer);
  const hitTargets = renderer.hitTargets?.bind(renderer);
  return {
    measure: ({ bounds, theme, widthProfile }) => renderer.measure?.({
      state,
      bounds,
      viewport: bounds,
      theme,
      widthProfile
    }) ?? {
        minWidth: 0,
        minHeight: 0,
        preferredWidth: 0,
        preferredHeight: 0
      },
    render: ({ layoutNode, buffer, theme, widthProfile, focus, focusedTargetId }) => {
      renderer.render({
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
      accessibility: ({ layoutNode, id, focused, focusedTargetId, theme, widthProfile }) => accessibility({
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
      focusTargets: ({ bounds, viewport, theme, widthProfile }) => focusTargets({
        state,
        bounds,
        viewport,
        theme,
        widthProfile
      })
    }),
    ...(hitTargets === undefined ? {} : {
      hitTargets: ({ bounds, layoutNode, theme, widthProfile }) => hitTargets({
        state,
        bounds,
        viewport: layoutNode.viewport,
        theme,
        widthProfile
      })
    })
  };
}

function inputMapFromHandlers<TMessage>(
  options: ElementTextInputHandlers<TMessage>
): RenderNodeInputMap<TMessage> | undefined {
  const text = options.onInput;
  const paste = options.onPaste;
  if (text === undefined && paste === undefined) return undefined;
  return {
    ...(text === undefined ? {} : { text }),
    ...(paste === undefined ? {} : { paste })
  };
}

function assertDecorativeCustomRendererIsNotInteractive<TMessage>(
  renderer: Record<string, unknown>,
  options: {
    readonly keyMap?: ElementKeyBindings<TMessage>;
    readonly inputMap?: RenderNodeInputMap<TMessage>;
  }
): void {
  if (options.keyMap !== undefined && Object.keys(options.keyMap).length > 0) {
    throw new Error('Decorative custom renderers cannot define keyboard messages.');
  }
  if (options.inputMap?.text !== undefined || options.inputMap?.paste !== undefined) {
    throw new Error('Decorative custom renderers cannot define text input messages.');
  }
  if (renderer['focusTargets'] !== undefined || renderer['hitTargets'] !== undefined) {
    throw new Error('Decorative custom renderers cannot expose focus or hit targets.');
  }
}

function isDecorativeAccessibility(value: ElementAccessibility | undefined): boolean {
  return isNonArrayObject(value) && value['decorative'] === true && !('role' in value);
}
