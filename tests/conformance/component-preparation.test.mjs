import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent, ComponentExecutionError, span } from '@ismail-elkorchi/terminal-ui/component';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createTuiRuntime, defineTui } from '@ismail-elkorchi/terminal-ui/tui';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';

function component(overrides = {}) {
  return defineComponent({
    structure: 'leaf', semantics: 'semantic',
    name: 'external/prepared-label', identity: 'required', accessibleRole: 'status',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 1 }),
    render: ({ model, target }) => target.write(0, 0, [span(model.label)]),
    accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label }),
    ...overrides,
  });
}
function runtimeFor(view, host = createMemoryTerminalHost()) {
  return createTuiRuntime({ host, app: defineTui({
    id: 'prepared-component', init: () => ({ state: 0 }),
    update: state => ({ state: state + 1 }), view,
  }) });
}

test('preparation settles through the host scheduler before synchronous hooks run', async () => {
  const order = [];
  const label = component({
    async prepare({ signal, yield: yieldWork }) {
      signal.throwIfAborted();
      order.push('prepare');
      await yieldWork();
      order.push('prepared');
    },
    render: ({ target }) => { order.push('paint'); target.write(0, 0, [span('done')]); },
  });
  const runtime = runtimeFor(() => label({ id: 'label', label: 'done' }));
  try {
    await runtime.start();
    assert.deepEqual(order, ['prepare', 'prepared', 'paint']);
  } finally { await runtime.dispose(); }
});

test('preparation failures identify the component and do not publish a frame', async () => {
  const failure = new Error('cannot prepare');
  const label = component({ prepare: () => Promise.reject(failure) });
  const host = createMemoryTerminalHost();
  const runtime = runtimeFor(() => label({ id: 'label', label: 'done' }), host);
  try {
    await assert.rejects(runtime.start(), error => error instanceof ComponentExecutionError
      && error.phase === 'prepare' && error.component === 'external/prepared-label' && error.cause === failure);
    assert.equal(host.output(), '');
  } finally { await runtime.dispose(); }
});

test('direct rendering stays synchronous and custom painters run unless retention is requested', () => {
  let preparations = 0;
  let paints = 0;
  const label = component({
    async prepare() { preparations += 1; },
    render: ({ target }) => { paints += 1; target.write(0, 0, [span('done')]); },
  });
  for (let index = 0; index < 2; index += 1) {
    const frame = renderElementFrame(label({ id: 'label', label: 'done' }), { columns: 4, rows: 1 });
    assert.equal(renderFramePlain(frame), 'done');
  }
  assert.equal(preparations, 0);
  assert.equal(paints, 2);
  assert.throws(() => component({ retainPaint: 'yes' }), /retainPaint/u);
  assert.throws(() => component({ prepare: 1 }), /prepare/u);
});

test('runtime disposal aborts preparation without publishing partial output', async () => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  let aborted = false;
  const label = component({
    prepare: ({ signal }) => new Promise(resolve => {
      signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
      began();
    }),
  });
  const host = createMemoryTerminalHost();
  const runtime = runtimeFor(() => label({ id: 'label', label: 'done' }), host);
  const startup = assert.rejects(runtime.start(), error => error instanceof ComponentExecutionError
    && error.phase === 'prepare');
  await started;
  await runtime.dispose();
  await startup;
  assert.equal(aborted, true);
  assert.equal(host.output(), '');
  assert.equal(runtime.frame(), undefined);
});
