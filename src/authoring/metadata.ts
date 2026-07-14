import type {
  ElementKeyBindings,
  ElementMeta,
  ElementStyles
} from '../element/metadata.ts';

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
