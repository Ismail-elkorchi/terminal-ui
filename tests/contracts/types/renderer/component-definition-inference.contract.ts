import { button, defineComponent, type Element } from '@ismail-elkorchi/terminal-ui/components';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const save = button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) });
const cancel = button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' } as const) });
const actionRow = defineComponent({
  structure: 'composite',
  semantics: 'semantic',
  name: 'actionRow',
  parts: [],
  measure: ({ measureChild }) => {
    const first = measureChild(0);
    const second = measureChild(1);
    return {
      minWidth: first.minWidth + second.minWidth,
      minHeight: Math.max(first.minHeight, second.minHeight),
      preferredWidth: first.preferredWidth + second.preferredWidth,
      preferredHeight: Math.max(first.preferredHeight, second.preferredHeight)
    };
  },
  layout: ({ bounds }) => [
    { ...bounds, width: Math.floor(bounds.width / 2) },
    { ...bounds, column: bounds.column + Math.floor(bounds.width / 2), width: bounds.width - Math.floor(bounds.width / 2) }
  ],
  accessibility: ({ id }) => ({ id, role: 'group', label: 'Actions' })
});
const composite = actionRow({
  id: 'actions',
  children: [save, cancel] as const
});

export type _Composite = Assert<Equal<
  MessageOf<typeof composite>,
  { readonly kind: 'save' } | { readonly kind: 'cancel' }
>>;

const interactive = defineComponent({
  structure: 'leaf',
  semantics: 'semantic',
  name: 'interactive',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ bounds }) => [{
    id: 'activate',
    bounds,
    message: () => ({ kind: 'definition' } as const)
  }],
  accessibility: ({ id, focused }) => ({
    id,
    role: 'button',
    label: 'Interactive',
    ...(focused ? { focused } : {})
  })
});
const interactiveInstance = interactive({
  id: 'interactive-instance',
  onInput: () => ({ kind: 'input' } as const),
  onPaste: () => ({ kind: 'paste' } as const),
  keys: { enter: () => ({ kind: 'key' } as const) },
  pointer: { onAction: () => ({ kind: 'pointer' } as const) }
});

export type _InstanceHandlers = Assert<Equal<
  MessageOf<typeof interactiveInstance>,
  | { readonly kind: 'definition' }
  | { readonly kind: 'input' }
  | { readonly kind: 'paste' }
  | { readonly kind: 'key' }
  | { readonly kind: 'pointer' }
>>;
