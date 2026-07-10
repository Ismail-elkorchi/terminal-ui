import type {
  AccessibleNodeDefinition,
  ComponentKeyBindings,
  ComponentOptions,
  ComponentTextInputHandlers
} from '../components/options/base.ts';
import type { Element } from '../components/element.ts';
import { elementFromRenderNode } from '../render-node/element.ts';
import type { RenderNodeInputMap, RenderNodeKeyMap } from '../render-node/index.ts';
import type { RenderNodeRenderer } from '../tui/render-node-renderer.ts';

const rendererHookNames = [
  'measure',
  'layout',
  'accessibility',
  'focusTargets',
  'hitTargets'
] as const satisfies readonly (keyof RenderNodeRenderer)[];

export interface CustomElementOptions<TMessage> extends ComponentOptions, ComponentTextInputHandlers<TMessage> {
  readonly renderer: RenderNodeRenderer<TMessage>;
  readonly state?: unknown;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

interface CustomRendererValidationOptions<TMessage> {
  readonly accessibility?: AccessibleNodeDefinition;
  readonly keyMap?: RenderNodeKeyMap<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
}

export function custom<TMessage>(options: CustomElementOptions<TMessage>): Element<TMessage> {
  const inputMap = inputMapFromHandlers(options);
  assertCustomRenderer(options.renderer, {
    ...(options.meta?.accessibility === undefined ? {} : { accessibility: options.meta.accessibility }),
    ...(options.keys === undefined ? {} : { keyMap: options.keys }),
    ...(inputMap === undefined ? {} : { inputMap })
  });
  return elementFromRenderNode({
    ...(options.id === undefined ? {} : { id: options.id }),
    kind: 'custom',
    props: {},
    custom: {
      renderer: options.renderer,
      ...(options.state === undefined ? {} : { state: options.state })
    },
    ...(options.keys === undefined || Object.keys(options.keys).length === 0 ? {} : { keyMap: options.keys }),
    ...(inputMap === undefined ? {} : { inputMap }),
    ...(options.meta?.layer === undefined ? {} : { layer: options.meta.layer }),
    ...(options.meta?.focus === undefined ? {} : { focus: options.meta.focus }),
    ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
    ...(options.meta?.accessibility === undefined ? {} : { accessibility: options.meta.accessibility })
  });
}

export function assertCustomRenderer<TMessage>(
  value: unknown,
  options: CustomRendererValidationOptions<TMessage>
): asserts value is RenderNodeRenderer<TMessage> {
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

function inputMapFromHandlers<TMessage>(
  options: ComponentTextInputHandlers<TMessage>
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
    readonly keyMap?: RenderNodeKeyMap<TMessage>;
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

function isDecorativeAccessibility(value: AccessibleNodeDefinition | undefined): boolean {
  return isRecord(value) && value['decorative'] === true && !('role' in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
