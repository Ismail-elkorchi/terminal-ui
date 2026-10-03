import {
  combineTuiResults, createTuiChild, liftTuiResult, reconcileTuiChildren, text,
  type TuiChildMessage, type TuiContribution, type TuiScopedSource, type TuiScopedResult,
} from '@ismail-elkorchi/terminal-ui';
import type { TuiContext, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui/tui';

type Message = TuiChildMessage<'increment'>;
const child = createTuiChild({
  init: () => ({ state: 0 }),
  update: (state: number, _message: 'increment') => ({ state: state + 1, outputs: ['saved' as const] }),
  view: (state: number) => text({ content: String(state) }),
}, (message): Message => message);

declare const context: TuiContext;
const first = child.init({ id: 'first', generation: 1 }, context);
const second = child.init({ id: 'second', generation: 1 }, context);
const changed = child.update(first.state, { id: 'first', generation: 1, message: 'increment' }, context);
const parent = { child: first.state, sibling: second.state };
const lifted = liftTuiResult(parent, 'child', changed);
const output: readonly 'saved'[] | undefined = lifted.outputs;
const combined: TuiUpdateResult<typeof parent, Message> = combineTuiResults(parent, first, second);
const scoped: TuiScopedResult<typeof parent, Message, 'saved'> = combineTuiResults(parent, changed);
const collection = reconcileTuiChildren([first.state, second.state], [second.state], instance => instance);
const source: readonly TuiScopedSource<Message>[] = child.subscriptions(first.state, context);
const removal: TuiScopedResult<undefined, Message> = child.remove(first.state);

// @ts-expect-error a contribution can only be obtained from an owned result
const forgedContribution: TuiContribution<Message> = {};
// @ts-expect-error a scoped source cannot be constructed by copying a source descriptor
const forgedSource: TuiScopedSource<Message> = { id: 'source', generation: 1, run: async () => undefined };
// @ts-expect-error the executable work of a scoped result is not public
void first.effects;
// @ts-expect-error scoped cancellation is forwarded through the whole contribution
void first.cancel;
// @ts-expect-error scoped focus is forwarded through the whole contribution
void first.focus;
// @ts-expect-error opaque contribution handles expose no executable effects
void first.contribution?.effects;
// @ts-expect-error scoped source handles expose no run method
void source[0]?.run;
// @ts-expect-error removal is an ordinary scoped result rather than a cancellation descriptor
const rawCancellation: TuiUpdateResult<undefined, Message> = { state: undefined, cancel: [child.remove(first.state)] };
// @ts-expect-error output inference survives lifting through parent aggregate state
const wrongOutput: readonly number[] | undefined = lifted.outputs;
// @ts-expect-error opaque contributions retain their parent message type
const wrongMessage: TuiContribution<number> | undefined = changed.contribution;

void output; void combined; void scoped; void collection; void removal;
void forgedContribution; void forgedSource; void rawCancellation; void wrongOutput; void wrongMessage;
