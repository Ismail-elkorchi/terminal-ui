import type { AccessibleNodeDefinition, CanvasPainter, WidgetInputMap, WidgetKeyMap } from './types.ts';
import type { WidgetRenderer } from '../tui/widget-renderer.ts';

const rendererHookNames = [
  'measure',
  'layout',
  'accessibility',
  'focusTargets',
  'hitTargets'
] as const satisfies readonly (keyof WidgetRenderer)[];

export function assertCanvasPainter(value: unknown): asserts value is CanvasPainter {
  if (typeof value !== 'function') {
    throw new Error('Canvas widgets must provide a painter function.');
  }
}

export function assertCustomRenderer<TMessage>(
  value: unknown,
  options: {
    readonly accessibility?: AccessibleNodeDefinition;
    readonly keyMap?: WidgetKeyMap<TMessage>;
    readonly inputMap?: WidgetInputMap<TMessage>;
  }
): asserts value is WidgetRenderer<TMessage> {
  if (!isRecord(value) || typeof value['render'] !== 'function') {
    throw new Error('Custom widgets must provide a renderer with a render function.');
  }
  for (const hook of rendererHookNames) {
    const candidate = value[hook];
    if (candidate !== undefined && typeof candidate !== 'function') {
      throw new Error(`Custom widget renderer field "${hook}" must be a function.`);
    }
  }
  if (isDecorativeAccessibility(options.accessibility)) {
    assertDecorativeCustomWidgetIsNotInteractive(value, options);
    return;
  }
  if (value['accessibility'] === undefined) {
    throw new Error('Custom widgets must provide accessibility or be marked decorative.');
  }
}

function assertDecorativeCustomWidgetIsNotInteractive<TMessage>(
  renderer: Record<string, unknown>,
  options: {
    readonly keyMap?: WidgetKeyMap<TMessage>;
    readonly inputMap?: WidgetInputMap<TMessage>;
  }
): void {
  if (options.keyMap !== undefined && Object.keys(options.keyMap).length > 0) {
    throw new Error('Decorative custom widgets cannot define keyboard messages.');
  }
  if (options.inputMap?.text !== undefined || options.inputMap?.paste !== undefined) {
    throw new Error('Decorative custom widgets cannot define text input messages.');
  }
  if (renderer['focusTargets'] !== undefined || renderer['hitTargets'] !== undefined) {
    throw new Error('Decorative custom widgets cannot expose focus or hit targets.');
  }
}

function isDecorativeAccessibility(value: AccessibleNodeDefinition | undefined): boolean {
  return isRecord(value) && value['decorative'] === true && !('role' in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
