import type {
  ElementAccessibility,
  ElementFocus,
  ElementKeyBindings,
  ElementLayer,
  ElementMeta,
  ElementStyles,
  InteractiveElementOptions
} from '../../element/metadata.ts';
import type { RenderNode } from './types.ts';

export function renderNodeInteraction<TMessage, TPart extends string = never>(options: {
  readonly keys?: ElementKeyBindings<TMessage> | undefined;
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
  readonly meta?: ElementMeta<TPart> | undefined;
  readonly pointer?: InteractiveElementOptions<TPart, TMessage>['pointer'] | undefined;
}): {
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles;
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: NonNullable<RenderNode<TMessage>['inputMap']>;
  readonly pointer?: NonNullable<RenderNode<TMessage>['pointer']>;
  readonly accessibility?: ElementAccessibility;
} {
  const keyMap = normalizedKeyBindings(options.keys);
  const inputMap = renderNodeInputMap(options);
  const pointer = options.pointer;
  const meta: ElementMeta<TPart> = {
    ...(options.meta ?? {}),
    focus: options.meta?.focus ?? {}
  };
  return {
    ...renderNodeMeta(meta),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(inputMap === undefined ? {} : { inputMap }),
    ...(pointer === undefined ? {} : {
      pointer: {
        ...(pointer.state === undefined ? {} : { state: pointer.state }),
        ...(pointer.onAction === undefined ? {} : { toActionMessage: pointer.onAction })
      }
    })
  };
}

export function renderNodeMeta<TPart extends string>(meta: ElementMeta<TPart> | undefined): {
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles;
  readonly accessibility?: ElementAccessibility;
} {
  return {
    ...(meta?.layer === undefined ? {} : { layer: meta.layer }),
    ...(meta?.focus === undefined ? {} : { focus: meta.focus }),
    ...(meta?.styles === undefined ? {} : { styles: normalizedStyles(meta.styles) }),
    ...(meta?.accessibility === undefined ? {} : { accessibility: meta.accessibility })
  };
}

function normalizedStyles<TPart extends string>(styles: ElementStyles<TPart>): ElementStyles {
  return {
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(styles.parts === undefined ? {} : { parts: { ...styles.parts } }),
    ...(styles.states === undefined ? {} : { states: { ...styles.states } })
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
