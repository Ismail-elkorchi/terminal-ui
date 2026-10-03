import {
  button, column, combineTuiResults, createTuiChild, liftTuiResult, reconcileTuiChildren, text,
} from '@ismail-elkorchi/terminal-ui';
import { createTuiRuntime, defineTui } from '@ismail-elkorchi/terminal-ui/tui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';

function invariant(condition, message) { if (!condition) throw new Error(message); }
async function settle(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Packed child work did not settle.');
}
function rejects(operation, message) {
  let failed = false;
  try { operation(); } catch { failed = true; }
  invariant(failed, message);
}
const release = Promise.withResolvers();
const sinks = [];
const signals = [];
let workStarted = false;
let disposals = 0;
const feature = createTuiChild({
  init: () => ({ state: 0, effects: [{ id: 'load', concurrency: 'replace', run: async () => ({ kind: 'message', message: 1 }) }] }),
  update: (state, message) => typeof message === 'number' ? { state: state + message } : {
    state, outputs: ['saved'], focus: { kind: 'element', elementId: 'second' },
    effects: [{ id: 'save', concurrency: 'replace', async run() {
      workStarted = true; await release.promise; return { kind: 'message', message: 4 };
    } }],
  },
  view: state => column([
    button({ id: 'first', label: `First ${String(state)}`, onPress: () => 1 }),
    button({ id: 'second', label: 'Save', onPress: () => 'save' }),
  ]),
  subscriptions: () => [{ id: 'feed', generation: 1, run(context, sink) {
    sinks.push(sink); signals.push(context.signal);
    return new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true }));
  }, dispose() { disposals++; } }],
}, child => ({ kind: 'child', child }));
const host = createMemoryTerminalHost();
const context = { terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), clock: host.clock, diagnostics: [] };
const owned = feature.init({ id: 'sample', generation: 1 }, context);
invariant(Object.keys(owned).sort().join(',') === 'contribution,state', 'scoped init exposes raw executable work');
invariant(Object.keys(owned.contribution).length === 0, 'contribution leaks ownership metadata');
rejects(() => combineTuiResults(owned.state, { ...owned, contribution: {} }), 'forged contribution was admitted');
rejects(() => combineTuiResults(owned.state, { ...owned, contribution: { ...owned.contribution } }), 'copied contribution was admitted');
const scopedSource = feature.subscriptions(owned.state, context)[0];
invariant(Object.keys(scopedSource).length === 0, 'scoped source exposes executable work');
for (const forged of [{}, { ...scopedSource }]) {
  const invalid = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
    init: () => ({ state: 0 }), update: state => ({ state }), view: () => text({ content: 'invalid' }),
    subscriptions: () => [forged],
  }) });
  let failed = false;
  try { await invalid.start(); } catch { failed = true; }
  finally { await invalid.dispose(); }
  invariant(failed, 'a forged scoped subscription was admitted');
}

const runtime = createTuiRuntime({ host, app: defineTui({
  init(context) {
    const initialized = ['one', 'two'].map(id => feature.init({ id, generation: 1 }, context));
    return combineTuiResults({ children: initialized.map(result => result.state), hidden: false, outputs: [] }, ...initialized);
  },
  update(state, message, context) {
    if (message.kind === 'hide') return { state: { ...state, hidden: true } };
    if (message.kind === 'remove') return liftTuiResult(state, 'children', reconcileTuiChildren(state.children, state.children.slice(1), instance => instance));
    if (message.kind === 'remount') {
      const next = feature.init({ id: 'one', generation: 2 }, context);
      return { ...next, state: { ...state, children: [next.state, ...state.children], hidden: false } };
    }
    const current = state.children.find(child => child.id === message.child.id);
    if (current === undefined) return { state };
    const next = feature.update(current, message.child, context);
    const children = next.state === current ? state.children : state.children.map(child => child === current ? next.state : child);
    const lifted = liftTuiResult(state, 'children', { ...next, state: children });
    return next.outputs === undefined ? lifted : { ...lifted, state: { ...lifted.state, outputs: [...state.outputs, ...next.outputs] } };
  },
  view: (state, context) => column(state.children.filter(child => !state.hidden || child.id !== 'one').map(child => feature.view(child, context))),
  subscriptions: (state, context) => state.children.flatMap(child => feature.subscriptions(child, context)),
}) });
try {
  await runtime.start();
  await settle(() => runtime.state().children.every(child => child.state === 1) && sinks.length === 2);
  const first = runtime.state().children[0];
  const second = runtime.state().children[1];
  await runtime.dispatch({ kind: 'child', child: { id: 'one', generation: 1, message: 'save' } });
  invariant(runtime.state().children[0] === first, 'no-op work changed child identity');
  invariant(runtime.state().outputs.join(',') === 'saved', 'forwarding lost a domain output');
  await settle(() => workStarted);
  await runtime.dispatch({ kind: 'hide' });
  invariant(!signals[0].aborted, 'hiding retired retained subscriptions');
  await sinks[0].emit({ kind: 'reliable', message: 2 });
  await settle(() => runtime.state().children[0].state === 3);
  release.resolve();
  await settle(() => runtime.state().children[0].state === 7);
  invariant(runtime.state().children[1] === second, 'sibling work escaped its lifetime');
  invariant(runtime.state().outputs.join(',') === 'saved', 'retained work duplicated domain output');
  await runtime.dispatch({ kind: 'remove' });
  invariant(signals[0].aborted && !signals[1].aborted, 'reconciliation retired the wrong source');
  invariant(disposals === 1, 'removed source did not dispose exactly once');
  await runtime.dispatch({ kind: 'remount' });
  await settle(() => runtime.state().children[0].state === 1);
  await sinks[0].emit({ kind: 'reliable', message: 100 });
  const remounted = runtime.state();
  await runtime.dispatch({ kind: 'child', child: { id: 'one', generation: 1, message: 100 } });
  invariant(runtime.state() === remounted, 'old source or envelope reached a remounted lifetime');
  invariant(runtime.state().children[1] === second, 'remount replaced the retained sibling');
} finally { release.resolve(); await runtime.dispose(); }
invariant(disposals === 3, 'scoped sources were not disposed once per lifetime');
console.log(JSON.stringify({ scenario: 'child-composition', status: 'passed' }));
