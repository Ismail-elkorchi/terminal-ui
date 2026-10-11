import {
  defineComponent,
  ignoreMessage,
  type ComponentAccessibilityResult,
  type ElementMessage,
} from '@ismail-elkorchi/terminal-ui/component';
import { button } from '@ismail-elkorchi/terminal-ui/components';

type Props = Readonly<Record<never, never>>;
const base = {
  name: 'terminal-ui-contracts/output', identity: 'required', structure: 'leaf',
  semantics: 'semantic', accessibleRole: 'group',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id }: { readonly id: string }) => ({ id }),
} as const;

const active = defineComponent<Props, 'activate'>()({
  ...base, emitsActions: true, states: ['disabled', 'inert', 'busy', 'readOnly'],
});
active({ id: 'enabled', onAction: action => ({ action }) });
active({ id: 'disabled', disabled: true, onAction: action => ({ action }) });
active({ id: 'inert', inert: true, onAction: action => ({ action }) });
active({ id: 'busy', busy: true, onAction: action => ({ action }) });
active({ id: 'read-only', readOnly: true, onAction: action => ({ action }) });
// @ts-expect-error a non-never action declaration requires its runtime witness
defineComponent<Props, 'activate'>()({ ...base });
// @ts-expect-error false cannot witness an action-producing definition
defineComponent<Props, 'activate'>()({ ...base, emitsActions: false });
// @ts-expect-error action-producing instances require an action mapper
active({ id: 'missing-mapper' });
// @ts-expect-error disabled does not erase lifecycle action output
active({ id: 'disabled-missing-mapper', disabled: true });
// @ts-expect-error inert does not erase lifecycle action output
active({ id: 'inert-missing-mapper', inert: true });
// @ts-expect-error busy is not an actionless state
active({ id: 'busy-missing-mapper', busy: true });
// @ts-expect-error read-only is not an actionless state
active({ id: 'read-only-missing-mapper', readOnly: true });

const passive = defineComponent<Props>()({ ...base });
const explicitlyPassive = defineComponent<Props>()({ ...base, emitsActions: false });
passive({ id: 'passive' });
explicitlyPassive({ id: 'explicitly-passive' });
// @ts-expect-error never cannot declare an action-producing witness
defineComponent<Props>()({ ...base, emitsActions: true });
// @ts-expect-error actionless instances cannot accept a mapper
passive({ id: 'passive-mapper', onAction: () => 'not-reachable' });
// @ts-expect-error explicit false has the same mapper prohibition
explicitlyPassive({ id: 'passive-mapper', onAction: () => 'not-reachable' });

const ignoring = defineComponent<Props>()({
  ...base,
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  keys: () => ({ enter: () => ignoreMessage() }),
});
ignoring({ id: 'ignore-only' });

const composed = defineComponent<Props, 'activate'>()({
  name: 'terminal-ui-contracts/emit-composed', identity: 'required', structure: 'composed',
  semantics: 'semantic', accessibleRole: 'group', emitsActions: true,
  compose: ({ emit }) => {
    // @ts-expect-error the runtime witness does not widen the declared action type
    emit('other');
    return button({ id: 'child', label: 'Run', onPress: () => emit('activate') });
  },
  accessibility: ({ id, children }) => ({ id, children }),
});
const emitted = composed({ id: 'composed', onAction: action => ({ kind: action } as const) });
const emittedMessage: ElementMessage<typeof emitted> = { kind: 'activate' };
// @ts-expect-error emitted action mapping preserves its exact message type
const wrongMessage: ElementMessage<typeof emitted> = { kind: 'other' };

const slotted = defineComponent<Props, 'activate'>()({
  name: 'terminal-ui-contracts/emit-slotted', identity: 'required', structure: 'composite',
  semantics: 'semantic', accessibleRole: 'group', emitsActions: true,
  slots: { content: { owner: 'implementation', cardinality: 'one', messages: 'bubble' } },
  implementationSlots: ({ emit }) => ({
    content: button({ id: 'child', label: 'Run', onPress: () => emit('activate') }),
  }),
  measure: base.measure, layout: ({ bounds }) => ({ content: bounds }),
  accessibility: ({ id, children }) => ({ id, children }),
});
slotted({ id: 'slotted', onAction: action => ({ kind: action }) });

const bubble = defineComponent<Props>()({
  name: 'terminal-ui-contracts/actionless-bubble', identity: 'required', structure: 'composed',
  semantics: 'semantic', accessibleRole: 'group',
  slots: { content: { owner: 'caller', cardinality: 'one', messages: 'bubble' } },
  compose: ({ slots }) => slots.content,
  accessibility: ({ id, children }) => ({ id, children }),
});
const bubbled = bubble({ id: 'bubble', slots: {
  content: button({ id: 'child', label: 'Run', onPress: () => ({ kind: 'child' } as const) }),
} });
const childMessage: ElementMessage<typeof bubbled> = { kind: 'child' };
// @ts-expect-error child messages remain exact even though the owner declares no actions
const wrongChildMessage: ElementMessage<typeof bubbled> = { kind: 'other' };

const root: ComponentAccessibilityResult = {
  id: 'root', children: [{ id: 'descendant', role: 'button', label: 'Child' }],
};
// @ts-expect-error roles belong to the component definition rather than callback roots
const invalidRoot: ComponentAccessibilityResult = { id: 'root', role: 'group' };
// @ts-expect-error even a matching callback root role is forbidden
defineComponent<Props>()({ ...base, accessibility: ({ id }) => ({ id, role: 'group' }) });
// @ts-expect-error undefined is still an authored root-role property
const undefinedRoot: ComponentAccessibilityResult = { id: 'root', role: undefined };

void emittedMessage;
void wrongMessage;
void childMessage;
void wrongChildMessage;
void root;
void invalidRoot;
void undefinedRoot;
