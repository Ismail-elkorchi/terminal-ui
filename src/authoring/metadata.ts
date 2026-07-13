import type {
  ElementAccessibility,
  ElementFocus,
  ElementKeyBindings,
  ElementLayer,
  ElementMeta,
  ElementStyles
} from '../element/metadata.ts';
import type { RenderNode } from '../renderer/model/index.ts';

export function mergeKeyBindings<TMessage>(
  generated: ElementKeyBindings<TMessage> | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  const mergedText = { ...(generated?.text ?? {}), ...(explicit?.text ?? {}) };
  const merged: ElementKeyBindings<TMessage> = {
    ...(generated ?? {}),
    ...(explicit ?? {}),
    ...(Object.keys(mergedText).length === 0 ? {} : { text: mergedText })
  };
  return Object.keys(merged).length === 0 ? undefined : merged;
}

export function interactionProps<TMessage, TPart extends string = never>(options: {
  readonly keys?: ElementKeyBindings<TMessage> | undefined;
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
  readonly meta?: ElementMeta<TPart> | undefined;
}): {
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles;
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: NonNullable<RenderNode<TMessage>['inputMap']>;
  readonly accessibility?: ElementAccessibility;
} {
  const keyMap = normalizeKeyBindings(options.keys);
  const inputMap = inputMapFromHandlers(options);
  const meta = withMetaDefaults(options.meta, { focus: {} });
  return {
    ...componentMetaProps(meta),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(inputMap === undefined ? {} : { inputMap })
  };
}

export function componentMetaProps<TPart extends string>(meta: ElementMeta<TPart> | undefined): {
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles;
  readonly accessibility?: ElementAccessibility;
} {
  return {
    ...(meta?.layer === undefined ? {} : { layer: meta.layer }),
    ...(meta?.focus === undefined ? {} : { focus: meta.focus }),
    ...(meta?.styles === undefined ? {} : { styles: renderNodeStyles(meta.styles) }),
    ...(meta?.accessibility === undefined ? {} : { accessibility: meta.accessibility })
  };
}

export function withMetaDefaults<TPart extends string>(
  meta: ElementMeta<TPart> | undefined,
  defaults: ElementMeta<TPart>
): ElementMeta<TPart> {
  const accessibility = meta?.accessibility ?? defaults.accessibility;
  const focus = mergeObject(defaults.focus, meta?.focus);
  const layer = mergeObject(defaults.layer, meta?.layer);
  const styles = mergeElementStyles(defaults.styles, meta?.styles);
  return compactMeta({
    ...(accessibility === undefined ? {} : { accessibility }),
    ...(focus === undefined ? {} : { focus }),
    ...(layer === undefined ? {} : { layer }),
    ...(styles === undefined ? {} : { styles })
  }) ?? {};
}

function renderNodeStyles<TPart extends string>(styles: ElementStyles<TPart>): ElementStyles {
  return {
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(styles.parts === undefined ? {} : { parts: { ...styles.parts } }),
    ...(styles.states === undefined ? {} : { states: { ...styles.states } })
  };
}

function mergeElementStyles<TPart extends string>(
  defaults: ElementStyles<TPart> | undefined,
  explicit: ElementStyles<TPart> | undefined
): ElementStyles<TPart> | undefined {
  if (defaults === undefined) return explicit;
  if (explicit === undefined) return defaults;
  const root = explicit.root ?? defaults.root;
  const parts: ElementStyles<TPart>['parts'] = defaults.parts === undefined && explicit.parts === undefined
    ? undefined
    : { ...(defaults.parts ?? {}), ...(explicit.parts ?? {}) } as NonNullable<ElementStyles<TPart>['parts']>;
  const states: ElementStyles<TPart>['states'] = defaults.states === undefined && explicit.states === undefined
    ? undefined
    : { ...(defaults.states ?? {}), ...(explicit.states ?? {}) };
  return {
    ...(root === undefined ? {} : { root }),
    ...(parts === undefined ? {} : { parts }),
    ...(states === undefined ? {} : { states })
  };
}

function inputMapFromHandlers<TMessage>(options: {
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
}): NonNullable<RenderNode<TMessage>['inputMap']> | undefined {
  if (options.onInput === undefined && options.onPaste === undefined) return undefined;
  return {
    ...(options.onInput === undefined ? {} : { text: options.onInput }),
    ...(options.onPaste === undefined ? {} : { paste: options.onPaste })
  };
}

function normalizeKeyBindings<TMessage>(
  keyMap: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}

function compactMeta<TPart extends string>(meta: ElementMeta<TPart>): ElementMeta<TPart> | undefined {
  const value: ElementMeta<TPart> = {
    ...(meta.accessibility === undefined ? {} : { accessibility: meta.accessibility }),
    ...(meta.focus === undefined ? {} : { focus: meta.focus }),
    ...(meta.layer === undefined ? {} : { layer: meta.layer }),
    ...(meta.styles === undefined ? {} : { styles: meta.styles })
  };
  return Object.keys(value).length === 0 ? undefined : value;
}

function mergeObject<T extends object>(defaults: T | undefined, current: T | undefined): T | undefined {
  if (defaults === undefined && current === undefined) return undefined;
  return { ...(defaults ?? {}), ...(current ?? {}) } as T;
}
