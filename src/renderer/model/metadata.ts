import type {
  ElementAccessibility,
  ElementFocus,
  ElementKeyBindings,
  ElementLayer,
  ElementMeta,
  ElementStyles,
  ElementVisualState,
} from '../../element/metadata.ts';
import type { RenderNode } from './types.ts';

export function renderNodeInteraction<TMessage, TPart extends string = never>(options: {
  readonly keys?: ElementKeyBindings<TMessage> | undefined;
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
  readonly meta?: ElementMeta | undefined;
  readonly styles?: ElementStyles<TPart, Exclude<ElementVisualState, 'default'>> | undefined;
}): {
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles<string, Exclude<ElementVisualState, 'default'>>;
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: NonNullable<RenderNode<TMessage>['inputMap']>;
  readonly accessibility?: ElementAccessibility;
} {
  const keyMap = normalizedKeyBindings(options.keys);
  const inputMap = renderNodeInputMap(options);
  return {
    ...renderNodeMeta(options),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(inputMap === undefined ? {} : { inputMap })
  };
}

export function renderNodeMeta(options: {
  readonly meta?: ElementMeta | undefined;
  readonly styles?: ElementStyles<string, Exclude<ElementVisualState, 'default'>> | undefined;
}): {
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles<string, Exclude<ElementVisualState, 'default'>>;
  readonly accessibility?: ElementAccessibility;
} {
  const meta = options.meta;
  return {
    ...(meta?.layer === undefined ? {} : { layer: meta.layer }),
    ...(meta?.focus === undefined ? {} : { focus: meta.focus }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(meta?.accessibility === undefined ? {} : { accessibility: meta.accessibility })
  };
}

function renderNodeInputMap<TMessage>(options: {
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
}): NonNullable<RenderNode<TMessage>['inputMap']> | undefined {
  if (options.onInput === undefined && options.onPaste === undefined) return undefined;
  return {
    ...(options.onInput === undefined ? {} : { text: options.onInput }),
    ...(options.onPaste === undefined ? {} : { paste: options.onPaste })
  };
}

function normalizedKeyBindings<TMessage>(
  keyMap: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}
