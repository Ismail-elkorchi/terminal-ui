import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../behavior/log-history.ts';
import { createLogViewerView, prepareLogViewerView, type LogViewerView, type LogViewerViewInput } from '../behavior/log-viewer-view.ts';
import { logViewer } from '../components/log-viewer/definition.ts';
import { text } from '../components/text-content/definition.ts';
import { failedTerminalWrite } from '../host/write-receipt.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { keyInput } from '../testing/input-events.ts';
import { defaultTextWidthProfile } from '../text/width-profile.ts';
import { createTuiPreparedQuery, type TuiPreparedQueryMessage, type TuiPreparedQueryState } from './prepared-query.ts';
import { createTuiRuntime } from './runtime.ts';
import { defineTui } from './definition.ts';
import type { TuiUpdateResult } from './types.ts';

void test('a wrapped 20000-entry app prepares committed widths outside updates and fences resize/removal', async () => {
  const history = createLogHistory(Array.from({ length: 20_000 }, (_, index) => ({ id: String(index), text: `entry ${String(index)} · 界🙂 ${'wrapped detail '.repeat(index % 7 + 2)}` })));
  const gates = new Map<AbortSignal, ReturnType<typeof Promise.withResolvers<undefined>>>();
  const signals: AbortSignal[] = [];
  let yields = 0;
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 60, rows: 8 } });
  const host = { ...memory, clock: { monotonicNow: () => memory.clock.monotonicNow(), async sleep(ms: number, signal?: AbortSignal) {
    if (ms !== 0 || signal === undefined) return memory.clock.sleep(ms, signal);
    yields++;
    if (!gates.has(signal)) {
      const gate = Promise.withResolvers<undefined>(); gates.set(signal, gate); signals.push(signal); await gate.promise;
    }
    return signal.aborted ? 'aborted' as const : 'elapsed' as const;
  } } };
  interface State extends TuiPreparedQueryState<LogViewerView> { readonly open: boolean; readonly query: string; }
  type Message = { readonly kind: 'prepare'; readonly input: LogViewerViewInput }
    | { readonly kind: 'query'; readonly text: string } | { readonly kind: 'close' } | { readonly kind: 'open' }
    | { readonly kind: 'ready'; readonly message: TuiPreparedQueryMessage<LogViewerView> };
  const requested: LogViewerViewInput[] = [];
  const accepted: LogViewerView[] = [];
  const prepared = createTuiPreparedQuery({ id: 'log-view', prepare: (input: LogViewerViewInput, context) => prepareLogViewerView(input, {
    signal: context.signal, yield: async () => { await context.clock.sleep(0, context.signal); },
  }), toMessage: (message): Message => ({ kind: 'ready', message }) });
  const runtime = createTuiRuntime({ host, app: defineTui<State, Message>({
    init: () => ({ state: { ...prepared.init(), open: true, query: '' } }),
    update(state, message): TuiUpdateResult<State, Message> {
      if (message.kind === 'prepare') { requested.push(message.input); return prepared.request(state, message.input); }
      if (message.kind === 'query') return { state: { ...state, query: message.text } };
      if (message.kind === 'close') return prepared.cancel({ ...state, open: false });
      if (message.kind === 'open') return { state: { ...state, open: true } };
      const next = prepared.update(state, message.message);
      if (next.state !== state && next.state.result !== null) accepted.push(next.state.result);
      return next;
    },
    inputBindings: [{ id: 'close', triggers: [{ kind: 'key', key: 'escape' }], message: { kind: 'close' } }],
    view: state => state.open ? logViewer({ id: 'wrapped-log', history, query: { text: state.query }, wrap: true, view: state.result,
      onLayout: (input): Message => ({ kind: 'prepare', input }),
    }) : text({ content: 'Closed' }),
  }) });
  const waitFor = async (check: () => boolean) => {
    for (let turn = 0; !check() && turn < 200; turn++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(check(), 'expected state reached without releasing unrelated work');
  };
  try {
    await runtime.start();
    await waitFor(() => signals.length === 1);
    assert.match(JSON.stringify(runtime.frame()?.accessibility), /Preparing log layout/u);
    assert.equal(requested[0]?.width, 60);
    await memory.terminalSizeControl?.setTerminalSize({ columns: 41, rows: 6 });
    await runtime.resize({ columns: 41, rows: 6 });
    await waitFor(() => signals.length === 2);
    assert.equal(signals[0]?.aborted, true);
    assert.equal(requested[1]?.width, 41);
    assert.equal(runtime.frame()?.width, 41);
    await runtime.dispatch({ kind: 'query', text: 'entry' });
    await waitFor(() => signals.length === 3);
    assert.equal(signals[1]?.aborted, true);
    await runtime.handleInput(keyInput('escape'));
    assert.equal(signals[2]?.aborted, true);
    assert.match(JSON.stringify(runtime.frame()?.accessibility), /Closed/u);
    await runtime.dispatch({ kind: 'open' });
    await waitFor(() => signals.length === 4);
    for (const gate of gates.values()) gate.resolve(undefined);
    await waitFor(() => !runtime.state().pending);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]?.width, 41);
    assert.equal(accepted[0].query.text, 'entry');
    assert.equal(accepted[0].matchingEntries, 20_000);
    assert.ok(yields > 500, 'cold wrapping/query work must remain cooperative');
    assert.doesNotMatch(JSON.stringify(runtime.frame()?.accessibility), /Preparing/u);
    const requestCount = requested.length;
    await runtime.redraw();
    assert.equal(requested.length, requestCount, 'accepted layout feedback must not loop');
    const narrower = createLogViewerView({ history, query: { text: 'entry' }, wrap: true, width: 40, widthProfile: defaultTextWidthProfile });
    assert.equal(narrower.matches, accepted[0].matches, 'resize reuses the same retained search projection');
  } finally { for (const gate of gates.values()) gate.resolve(undefined); await runtime.dispose(); }
});

void test('failed wrapped-log frame publication never requests preparation', async () => {
  const host = createMemoryTerminalHost();
  const history = createLogHistory([{ id: 'a', text: 'body' }]);
  let requests = 0;
  host.write = async () => failedTerminalWrite('test', new Error('not committed'));
  const runtime = createTuiRuntime({ host, app: defineTui<number, number>({
    init: () => ({ state: 0 }), update: state => ({ state }),
    view: () => logViewer({ id: 'log', history, wrap: true, view: null, onLayout: () => { requests++; return 1; } }),
  }) });
  try { await assert.rejects(runtime.start()); assert.equal(requests, 0); }
  finally { await runtime.dispose(); }
});
