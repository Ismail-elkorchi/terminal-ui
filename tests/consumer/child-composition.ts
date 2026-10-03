import {
  combineTuiResults, createTuiChild, liftTuiResult, reconcileTuiChildren, text,
  type TuiChildMessage, type TuiChildState, type TuiContribution, type TuiScopedSource,
} from '@ismail-elkorchi/terminal-ui';
import { createTuiRuntime, defineTui } from '@ismail-elkorchi/terminal-ui/tui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';

type Message = { readonly kind: 'child'; readonly child: TuiChildMessage<number> } | { readonly kind: 'remove' };
interface State { readonly children: readonly TuiChildState<number>[]; readonly outputs: readonly string[]; }

// @ts-expect-error a scoped work capability cannot be forged from an empty object
const forgedContribution: TuiContribution<Message> = {};
// @ts-expect-error a raw executable descriptor is not a scoped source capability
const forgedSource: TuiScopedSource<Message> = { id: 'events', generation: 1, run: async () => undefined };
void forgedContribution; void forgedSource;

export async function verifyChildComposition(): Promise<void> {
  const child = createTuiChild<number, number, Message, string>({
    init: () => ({ state: 0 }),
    update: (state, amount) => ({ state: state + amount, outputs: ['saved'] }),
    view: state => text({ content: String(state) }),
  }, child => ({ kind: 'child', child }));
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui<State, Message>({
    init(context) {
      const first = child.init({ id: 'one', generation: 1 }, context);
      const second = child.init({ id: 'two', generation: 1 }, context);
      // @ts-expect-error executable work is intentionally absent from scoped result declarations
      void first.effects;
      // @ts-expect-error opaque handles do not expose executable descriptors
      void first.contribution?.effects;
      // @ts-expect-error removal cannot be placed into a raw cancellation array
      const invalid: import('@ismail-elkorchi/terminal-ui').TuiUpdateResult<undefined, Message> = { state: undefined, cancel: [child.remove(first.state)] };
      void invalid;
      return combineTuiResults({ children: [first.state, second.state], outputs: [] }, first, second);
    },
    update(state, message, context) {
      if (message.kind === 'remove') {
        return liftTuiResult(state, 'children', reconcileTuiChildren(state.children, state.children.slice(1), instance => instance));
      }
      const instance = state.children.find(instance => instance.id === message.child.id);
      if (instance === undefined) return { state };
      const next = child.update(instance, message.child, context);
      const outputs: readonly string[] | undefined = next.outputs;
      return { ...next, state: {
        children: state.children.map(value => value === instance ? next.state : value),
        outputs: [...state.outputs, ...(outputs ?? [])],
      } };
    },
    view: state => text({ content: String(state.children.length) }),
    subscriptions: (state, context) => state.children.flatMap(instance => child.subscriptions(instance, context)),
  }) });
  try {
    await runtime.start();
    const sibling = runtime.state().children[1];
    await runtime.dispatch({ kind: 'child', child: { id: 'one', generation: 1, message: 2 } });
    if (runtime.state().children[0]?.state !== 2 || runtime.state().children[1] !== sibling
      || runtime.state().outputs[0] !== 'saved') throw new Error('Packed child composition lost state or domain output.');
    await runtime.dispatch({ kind: 'remove' });
    if (runtime.state().children.length !== 1 || runtime.state().children[0] !== sibling) {
      throw new Error('Packed child reconciliation lost retained sibling identity.');
    }
  } finally { await runtime.dispose(); }
}
