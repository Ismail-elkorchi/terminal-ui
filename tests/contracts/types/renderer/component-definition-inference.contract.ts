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
  name: 'terminal-ui-tests/components/actionRow',
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

type InteractiveAction =
  | { readonly kind: 'hit' }
  | { readonly kind: 'input' }
  | { readonly kind: 'paste' }
  | { readonly kind: 'key' }
  | { readonly kind: 'pointer' };

const interactive = defineComponent<Record<never, never>, InteractiveAction>({
  structure: 'leaf',
  semantics: 'semantic',
  name: 'terminal-ui-tests/components/interactive',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ bounds }) => [{
    id: 'activate',
    bounds,
    message: () => ({ kind: 'hit' } as const)
  }],
  keys: () => ({ enter: () => ({ kind: 'key' }) }),
  onInput: () => ({ kind: 'input' }),
  onPaste: () => ({ kind: 'paste' }),
  pointer: {
    onAction: () => ({ kind: 'pointer' })
  },
  accessibility: ({ id, focused }) => ({
    id,
    role: 'button',
    label: 'Interactive',
    ...(focused ? { focused } : {})
  })
});
const interactiveInstance = interactive({
  id: 'interactive-instance',
  onAction: (action) => ({ kind: 'component' as const, action })
});

export type _InstanceHandlers = Assert<Equal<
  MessageOf<typeof interactiveInstance>,
  { readonly kind: 'component'; readonly action: InteractiveAction }
>>;

const inferredActionControl = defineComponent({
  structure: 'leaf',
  semantics: 'semantic',
  name: 'terminal-ui-tests/components/inferredActionControl',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  keys: () => ({ enter: () => ({ kind: 'activate' } as const) }),
  accessibility: ({ id }) => ({ id, role: 'button', label: 'Inferred action' })
});
const inferredActionInstance = inferredActionControl({
  id: 'inferred-action-instance',
  onAction: (action) => ({ kind: 'wrapped' as const, action })
});

export type _InferredDefinitionAction = Assert<Equal<
  MessageOf<typeof inferredActionInstance>,
  { readonly kind: 'wrapped'; readonly action: { readonly kind: 'activate' } }
>>;

interface BadgeOptions {
  readonly label: string;
}

const badge = defineComponent<BadgeOptions>({
  structure: 'leaf',
  semantics: 'semantic',
  name: 'terminal-ui-tests/components/badge',
  decodeOptions(value) {
    if (typeof value !== 'object' || value === null || !('label' in value)
      || typeof value.label !== 'string') {
      throw new TypeError('badge label must be a string');
    }
    return { label: value.label };
  },
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id, options }) => ({ id, role: 'status', label: options.label })
});

badge({ id: 'badge', label: 'Ready' });
// @ts-expect-error component factories expose only their declared options
badge({ id: 'badge-with-typo', label: 'Ready', lable: 'typo' });

defineComponent<BadgeOptions>({
  // @ts-expect-error component-specific options require a runtime decoder
  structure: 'leaf',
  semantics: 'semantic',
  name: 'terminal-ui-tests/components/undecoded-badge',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id }) => ({ id, role: 'status', label: id })
});

defineComponent({
  structure: 'leaf',
  semantics: 'semantic',
  // @ts-expect-error defined component identities must be package-qualified
  name: 'unqualified',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id }) => ({ id, role: 'status', label: id })
});
