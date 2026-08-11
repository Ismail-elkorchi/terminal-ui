import { button, text, type Element } from '@ismail-elkorchi/terminal-ui/components';
import {
  defineComponent,
  span,
  type ComponentMessage
} from '@ismail-elkorchi/terminal-ui/component';
import { row } from '@ismail-elkorchi/terminal-ui/layout';

type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
type Assert<TValue extends true> = TValue;

const actionRowSlots = {
  actions: { cardinality: 'many', owner: 'caller', messages: 'bubble' }
} as const;
const actionRow = defineComponent<
  Record<never, never>,
  Record<never, never>,
  never,
  never,
  readonly [],
  'required',
  readonly [],
  typeof actionRowSlots
>({
  name: 'terminal-ui-tests/components/action-row',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: actionRowSlots,
  measure: ({ slots }) => {
    const count = slots.count('actions');
    const measurements = Array.from({ length: count }, (_, index) => slots.measure('actions', index));
    return {
      minWidth: measurements.reduce((total, value) => total + value.minWidth, 0),
      minHeight: Math.max(0, ...measurements.map((value) => value.minHeight)),
      preferredWidth: measurements.reduce((total, value) => total + value.preferredWidth, 0),
      preferredHeight: Math.max(0, ...measurements.map((value) => value.preferredHeight))
    };
  },
  layout: ({ bounds, slots }) => ({
    actions: Array.from({ length: slots.count('actions') }, (_, index) => ({
      row: 0,
      column: index,
      width: Math.max(0, bounds.width - index),
      height: bounds.height
    }))
  }),
  accessibility: ({ id, children }) => ({ id, role: 'group', label: 'Actions', children })
});

const save = button({ id: 'save', label: 'Save', onAction: () => ({ kind: 'save' } as const) });
const cancel = button({ id: 'cancel', label: 'Cancel', onAction: () => ({ kind: 'cancel' } as const) });
const composite = actionRow({ id: 'actions', slots: { actions: [save, cancel] as const } });
const compositeMessageType: Assert<Equal<
  MessageOf<typeof composite>,
  { readonly kind: 'save' } | { readonly kind: 'cancel' }
>> = true;
void compositeMessageType;

type InteractiveAction =
  | { readonly kind: 'hit' }
  | { readonly kind: 'input' }
  | { readonly kind: 'paste' }
  | { readonly kind: 'key' }
  | { readonly kind: 'pointer' };

const interactive = defineComponent<
  Record<never, never>,
  Record<never, never>,
  InteractiveAction
>({
  name: 'terminal-ui-tests/components/interactive',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ bounds }) => [{ id: 'activate', bounds, message: () => ({ kind: 'hit' }) }],
  keys: () => ({ enter: () => ({ kind: 'key' }) }),
  onInput: () => ({ kind: 'input' }),
  onPaste: () => ({ kind: 'paste' }),
  pointer: { onAction: () => ({ kind: 'pointer' }) },
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
const instanceHandlerMessageType: Assert<Equal<
  MessageOf<typeof interactiveInstance>,
  { readonly kind: 'component'; readonly action: InteractiveAction }
>> = true;
void instanceHandlerMessageType;

interface BadgeOptions { readonly label: string }
interface BadgeModel { readonly label: string }
const badge = defineComponent<
  BadgeOptions,
  BadgeModel,
  never,
  never,
  readonly [],
  'optional'
>({
  name: 'terminal-ui-tests/components/badge',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  prepare(value) {
    if (typeof value.label !== 'string') {
      throw new TypeError('badge label must be a string');
    }
    return { label: value.label };
  },
  measure: ({ model }) => ({
    minWidth: 1,
    minHeight: 1,
    preferredWidth: model.label.length,
    preferredHeight: 1
  }),
  render: ({ target, model }) => {
    target.write(0, 0, [span(model.label)]);
  },
  accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label })
});
badge({ label: 'Ready' });
badge({ id: 'identified-badge', label: 'Ready' });
// @ts-expect-error component factories expose only declared options
badge({ label: 'Ready', lable: 'typo' });

interface GenericBoxOptions {
  readonly values: readonly string[];
}
interface GenericBoxModel {
  readonly values: readonly string[];
}
type GenericBoxFactory = <TValue>(options: {
    readonly values: readonly TValue[];
    readonly label: (value: TValue) => string;
  }) => Element;
const instantiateGenericBox = defineComponent<
  GenericBoxOptions,
  GenericBoxModel,
  never,
  never,
  readonly [],
  'optional',
  readonly []
>({
  name: 'terminal-ui-tests/components/generic-box',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  prepare(value) {
    if (!Array.isArray(value.values)
      || value.values.some((entry) => typeof entry !== 'string')) {
      throw new TypeError('generic box values must be strings');
    }
    return { values: value.values };
  },
  measure: ({ model }) => ({
    minWidth: 0,
    minHeight: 0,
    preferredWidth: Math.max(0, ...model.values.map((value) => value.length)),
    preferredHeight: model.values.length
  }),
  render: ({ target, model }) => {
    model.values.forEach((value, index) => {
      target.write(index, 0, [span(value)]);
    });
  },
  accessibility: ({ id, model }) => ({ id, role: 'list', label: `${String(model.values.length)} values` })
});

const genericBox: GenericBoxFactory = (options) => instantiateGenericBox({
  values: options.values.map(options.label)
});

genericBox({ values: [1, 2, 3], label: (value) => value.toFixed(0) });
genericBox({ values: [{ id: 'one' }], label: (value) => value.id });

const noFactoryBuilderDefinition = {
  name: 'terminal-ui-tests/components/no-factory-builder',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
  render: () => undefined,
  accessibility: ({ id }: { readonly id: string }) => ({ id, role: 'text' })
} as const;
// @ts-expect-error factory adapters wrap the canonical factory instead of replacing its result type
defineComponent(noFactoryBuilderDefinition, () => () => 'not an element');

const optionalSlotComponent = defineComponent({
  name: 'terminal-ui-tests/components/optional-slot',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  slots: {
    note: { cardinality: 'optional', owner: 'caller', messages: 'bubble' }
  } as const,
  compose: ({ slots }) => slots.note ?? text({ content: '' }),
  accessibility: ({ id, slots }) => ({ id, role: 'group', children: slots.note })
});
optionalSlotComponent({ id: 'optional-slot' });

const composed = defineComponent({
  name: 'terminal-ui-tests/components/composed',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  compose: () => row([text({ content: 'ordinary public child' })]),
  accessibility: ({ id, children }) => ({ id, role: 'group', label: 'Composed', children })
});
composed({ id: 'composed' });

const captureSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'capture' }
} as const;
const capturing = defineComponent<
  Record<never, never>,
  Record<never, never>,
  { readonly kind: 'captured'; readonly message: unknown },
  never,
  readonly [],
  'required',
  readonly [],
  typeof captureSlots
>({
  name: 'terminal-ui-tests/components/capturing',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: captureSlots,
  capture: ({ message }) => ({ kind: 'captured', message }),
  measure: ({ slots }) => slots.measure('content'),
  layout: ({ bounds }) => ({ content: bounds }),
  accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
});
const captured = capturing({
  id: 'capturing',
  slots: { content: save },
  onAction: (action) => ({ kind: 'outer' as const, action })
});
const capturedMessageType: Assert<Equal<
  MessageOf<typeof captured>,
  { readonly kind: 'outer'; readonly action: { readonly kind: 'captured'; readonly message: unknown } }
>> = true;
void capturedMessageType;

const noneSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'none' }
} as const;
const nonInteractiveWrapper = defineComponent<
  Record<never, never>,
  Record<never, never>,
  never,
  never,
  readonly [],
  'required',
  readonly [],
  typeof noneSlots
>({
  name: 'terminal-ui-tests/components/non-interactive-wrapper',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: noneSlots,
  measure: ({ slots }) => slots.measure('content'),
  layout: ({ bounds }) => ({ content: bounds }),
  accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
});
nonInteractiveWrapper({ id: 'passive', slots: { content: text({ content: 'passive' }) } });
// @ts-expect-error a none-policy slot accepts only message-free children
nonInteractiveWrapper({ id: 'interactive', slots: { content: save } });
// @ts-expect-error composites accept only their declared named slots
actionRow({ id: 'legacy-children', children: [save] });

// @ts-expect-error undefined is not an application message resolution
interactive({ id: 'undefined-action', onAction: () => undefined });

const componentMessage: ComponentMessage = 'valid';
void componentMessage;
// @ts-expect-error null is reserved from component messages
const nullComponentMessage: ComponentMessage = null;
void nullComponentMessage;

declare const nullMessageElement: Element<null>;
// @ts-expect-error component slots cannot reintroduce the reserved null message
actionRow({ id: 'null-child', slots: { actions: [nullMessageElement] } });
