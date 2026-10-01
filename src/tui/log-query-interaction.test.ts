import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../behavior/log-history.ts';
import { prepareLogViewerView, type LogViewerView } from '../behavior/log-viewer-view.ts';
import { logViewer } from '../components/log-viewer/definition.ts';
import { text } from '../components/text-content/definition.ts';
import { keyInput } from '../testing/input-events.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { createTuiPreparedQuery, type TuiPreparedQueryMessage, type TuiPreparedQueryState } from './prepared-query.ts';
import { createTuiRuntime } from './runtime.ts';
import { defineTui } from './definition.ts';
import type { TuiUpdateResult } from './types.ts';

void test('paused log queries admit replacement, Escape and resize without committing stale results', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'alpha beta gamma' })));
  const gates = new Map<AbortSignal, ReturnType<typeof Promise.withResolvers<undefined>>>();
  const signals: AbortSignal[] = [];
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 8 } });
  const host = { ...memory, clock: { monotonicNow: () => memory.clock.monotonicNow(), async sleep(ms: number, signal?: AbortSignal) {
    if (ms !== 0 || signal === undefined) return memory.clock.sleep(ms, signal);
    const previous = gates.get(signal);
    if (previous === undefined) {
      const gate = Promise.withResolvers<undefined>();
      gates.set(signal, gate);
      signals.push(signal);
      await gate.promise;
    }
    return signal.aborted ? 'aborted' as const : 'elapsed' as const;
  } } };
  interface State extends TuiPreparedQueryState<LogViewerView> { readonly query: string; readonly open: boolean; readonly resizes: number; }
  type Message = { readonly kind: 'query'; readonly text: string } | { readonly kind: 'close' } | { readonly kind: 'resize' } | { readonly kind: 'result'; readonly message: TuiPreparedQueryMessage<LogViewerView> };
  const accepted: string[] = [];
  const prepared = createTuiPreparedQuery({ id: 'log-query', prepare: (query: string, context) => prepareLogViewerView({ history, query: { text: query } }, { signal: context.signal, yield: async () => { await context.clock.sleep(0, context.signal); } }), toMessage: (message): Message => ({ kind: 'result', message }) });
  const runtime = createTuiRuntime({ host, app: defineTui<State, Message>({
    init: () => ({ state: { ...prepared.init(), query: '', open: true, resizes: 0 } }),
    update(state, message): TuiUpdateResult<State, Message> {
      if (message.kind === 'query') return prepared.request({ ...state, query: message.text, open: true, result: null }, message.text);
      if (message.kind === 'close') return prepared.cancel({ ...state, open: false });
      if (message.kind === 'resize') return { state: { ...state, resizes: state.resizes + 1 } };
      const next = prepared.update(state, message.message);
      if (next.state !== state && next.state.result !== null) accepted.push(next.state.result.query.text);
      return next;
    },
    inputBindings: [{ id: 'close', triggers: [{ kind: 'key', key: 'escape' }], message: { kind: 'close' } }],
    resizeMessage: () => ({ kind: 'resize' }),
    view: state => state.open ? logViewer({ id: 'log', history, query: { text: state.query }, view: state.result }) : text({ content: 'Closed' }),
  }) });
  const waitForSignals = async (count: number) => {
    for (let turn = 0; signals.length < count && turn < 100; turn++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(signals.length, count);
  };
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'query', text: 'alpha' });
    await waitForSignals(1);
    await runtime.dispatch({ kind: 'query', text: 'beta' });
    await waitForSignals(2);
    assert.equal(runtime.state().query, 'beta');
    assert.equal(signals[0]?.aborted, true, 'replacement aborts paused work before it resumes');
    await runtime.resize({ columns: 28, rows: 6 });
    assert.equal(runtime.state().resizes, 1);
    assert.equal(runtime.frame()?.width, 28);
    await runtime.handleInput(keyInput('escape'));
    assert.equal(runtime.state().open, false);
    assert.equal(signals[1]?.aborted, true);
    assert.match(JSON.stringify(runtime.frame()?.accessibility), /Closed/u);
    await runtime.dispatch({ kind: 'query', text: 'gamma' });
    await waitForSignals(3);
    for (const signal of signals) gates.get(signal)?.resolve(undefined);
    for (let turn = 0; runtime.state().pending && turn < 100; turn++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(runtime.state().pending, false);
    assert.deepEqual(accepted, ['gamma']);
    assert.equal(runtime.state().result?.query.text, 'gamma');
    assert.match(JSON.stringify(runtime.frame()?.accessibility), /Matching entries: 6000/u);
  } finally {
    for (const gate of gates.values()) gate.resolve(undefined);
    await runtime.dispose();
  }
});
