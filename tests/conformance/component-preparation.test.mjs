import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent, span } from '@ismail-elkorchi/terminal-ui/component';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createTuiRuntime, createTuiPreparedQuery, defineTui } from '@ismail-elkorchi/terminal-ui/tui';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';

function component(overrides = {}) {
  return defineComponent({
    structure: 'leaf', semantics: 'semantic',
    name: 'external/prepared-label', identity: 'required', accessibleRole: 'status',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 16, preferredHeight: 1 }),
    render: ({ model, target }) => target.write(0, 0, [span(model.label)]),
    accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label }),
    ...overrides,
  });
}

test('component definitions reject the retired preparation hook even when undefined', () => {
  for (const prepare of [undefined, 1, async () => {}]) {
    assert.throws(() => component({ prepare }), /prepare is unsupported/u);
  }
});

test('direct rendering consumes explicit data synchronously and paints without retention', () => {
  let paints = 0;
  const label = component({
    render: ({ model, target }) => { paints++; target.write(0, 0, [span(model.label)]); },
  });
  const result = Object.freeze({ label: 'done' });
  for (let index = 0; index < 2; index++) {
    assert.equal(renderFramePlain(renderElementFrame(label({ id: 'label', ...result }), { columns: 4, rows: 1 })), 'done');
  }
  assert.equal(paints, 2);
  assert.throws(() => component({ retainPaint: 'yes' }), /retainPaint/u);
});

function application(prepare) {
  const label = component();
  const query = createTuiPreparedQuery({ id: 'label-work', prepare, toMessage: message => ({ kind: 'result', message }) });
  return defineTui({
    id: 'prepared-component',
    init: () => { const initial = query.request(query.init(), 'request'); return { ...initial, state: { ...initial.state, count: 0 } }; },
    update(state, message) {
      if (message.kind === 'increment') return { state: { ...state, count: state.count + 1 } };
      return query.update(state, message.message);
    },
    view: state => label({ id: 'label', label: state.result ?? (state.error === null ? `pending ${state.count}` : 'failed') }),
  });
}

test('input and resize commit while effect-owned preparation is blocked', async () => {
  const started = Promise.withResolvers();
  const released = Promise.withResolvers();
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: application(async () => {
    started.resolve(); return released.promise;
  }) });
  try {
    await runtime.start();
    await started.promise;
    assert.match(renderFramePlain(runtime.frame()), /pending 0/u);
    await runtime.dispatch({ kind: 'increment' });
    await runtime.resize({ columns: 32, rows: 4 });
    assert.equal(runtime.state().count, 1);
    assert.match(renderFramePlain(runtime.frame()), /pending 1/u);
    released.resolve('done');
    while (runtime.state().pending) await runtime.nextChange();
    assert.match(renderFramePlain(runtime.frame()), /done/u);
  } finally { released.resolve('done'); await runtime.dispose(); }
});

test('preparation failure becomes ordinary state after an accepted pending frame', async () => {
  const released = Promise.withResolvers();
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: application(async () => {
    await released.promise; throw new Error('cannot prepare');
  }) });
  try {
    await runtime.start();
    assert.match(renderFramePlain(runtime.frame()), /pending/u);
    released.resolve();
    while (runtime.state().pending) await runtime.nextChange();
    assert.equal(runtime.state().error.code, 'TUI_EFFECT_FAILED');
    assert.match(renderFramePlain(runtime.frame()), /failed/u);
  } finally { released.resolve(); await runtime.dispose(); }
});

test('disposal cancels effect preparation and rejects an ignored-cancellation result', async () => {
  const started = Promise.withResolvers();
  const released = Promise.withResolvers();
  let signal;
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: application(async (_input, context) => {
    signal = context.signal; started.resolve(); return released.promise;
  }) });
  await runtime.start();
  await started.promise;
  const before = runtime.state();
  const aborted = new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  const disposing = runtime.dispose();
  await aborted;
  assert.equal(signal.aborted, true);
  released.resolve('obsolete');
  await disposing;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.state(), before);
});
