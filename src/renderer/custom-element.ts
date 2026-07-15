import type {
  ElementAccessibility,
  ElementKeyBindings,
  InteractiveElementOptions,
  ElementTextInputHandlers
} from '../element/metadata.ts';
import type { Element } from '../element/index.ts';
import { elementFromRenderNode } from './model/element.ts';
import type { RenderNodeInputMap } from './model/index.ts';
import type { RenderNodeRenderer } from './model/renderer.ts';
import type { CustomRenderer } from './custom-renderer.ts';
import { renderNodeId } from '../foundation/identity.ts';
import { renderNodeInteraction } from './model/metadata.ts';

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
  return elementFromRenderNode<'custom', TMessage>({
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

export function assertCustomRenderer(
  value: unknown,
  options: CustomRendererValidationOptions<unknown>
): asserts value is CustomRenderer<unknown, unknown> {
  if (!isRecord(value) || typeof value['render'] !== 'function') {
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
  return {
    ...(renderer.measure === undefined ? {} : {
      measure: ({ bounds, theme }) => renderer.measure?.({ state, bounds, theme }) ?? {
        minWidth: 0,
        minHeight: 0,
        preferredWidth: 0,
        preferredHeight: 0
      }
    }),
    render: ({ layoutNode, buffer, theme, focus }) => {
      renderer.render({ state, bounds: layoutNode.bounds, buffer, theme, focus });
    },
    ...(renderer.accessibility === undefined ? {} : {
      accessibility: ({ layoutNode, id, focused, theme }) => renderer.accessibility?.({
        state,
        bounds: layoutNode.bounds,
        id,
        focused,
        theme
      }) ?? { id, role: 'text', label: id }
    }),
    ...(renderer.focusTargets === undefined ? {} : {
      focusTargets: ({ bounds, theme }) => renderer.focusTargets?.({ state, bounds, theme }) ?? []
    }),
    ...(renderer.hitTargets === undefined ? {} : {
      hitTargets: ({ bounds, theme }) => renderer.hitTargets?.({ state, bounds, theme }) ?? []
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
  return isRecord(value) && value['decorative'] === true && !('role' in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
