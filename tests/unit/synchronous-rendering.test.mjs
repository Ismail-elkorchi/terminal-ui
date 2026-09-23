import assert from 'node:assert/strict';
import test from 'node:test';

import { defineComponent, ComponentExecutionError } from '../../dist/component/index.js';
import { testCanvas as canvas } from '../helpers/canvas.mjs';
import {
  createCanvas2D,
  createFrameBuffer,
  renderElementFrame,
  renderFramePlain,
} from '../../dist/renderer/index.js';
import { text } from '../../dist/components/index.js';
import { viewport } from '../../dist/layout/index.js';

const size = { columns: 8, rows: 1 };
const measurement = { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 };

function leaf(render) {
  const create = defineComponent({
    name: 'terminal-ui-tests/components/async-leaf',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'text',
    measure: () => measurement,
    render,
    accessibility: ({ id }) => ({ id, role: 'text', label: 'leaf' }),
  });
  return create({ id: 'leaf-1' });
}

function composite(phase, hook) {
  const create = defineComponent({
    name: 'terminal-ui-tests/components/async-composite',
    identity: 'required',
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: { body: { cardinality: 'one', owner: 'caller', messages: 'bubble' } },
    measure: () => measurement,
    layout: ({ bounds }) => ({ body: bounds }),
    [phase]: hook,
    accessibility: ({ id, children }) => ({ id, role: 'group', label: 'composite', children }),
  });
  return create({ id: 'composite-1', slots: { body: text({ content: 'X' }) } });
}

function assertPaintFailure(run, name, id, callback) {
  assert.throws(run, (error) => error instanceof ComponentExecutionError
    && error.component === name
    && error.instanceId === id
    && error.phase === 'paint'
    && error.cause instanceof TypeError
    && error.cause.message.includes(callback));
}

test('leaf paint rejects async results, closes its target, and observes later rejection', async () => {
  let target;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const element = leaf(async (input) => {
    target = input.target;
    await gate;
    input.target.write(0, 0, [{ text: 'late' }]);
  });
  assertPaintFailure(
    () => renderElementFrame(element, size),
    'terminal-ui-tests/components/async-leaf', 'leaf-1', 'Component render',
  );
  assert.throws(() => target.write(0, 0, [{ text: 'late' }]), /drawing target is closed/u);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renderFramePlain(renderElementFrame(leaf(({ target: next }) => {
    next.write(0, 0, [{ text: 'ok' }]);
  }), size)), 'ok');
});

test('viewport buffer painting closes a failed child component target', async () => {
  let target;
  const element = viewport(leaf(({ target: local }) => {
    target = local;
    return Promise.reject(new Error('async paint'));
  }), { offset: { row: 0 } });
  assertPaintFailure(
    () => renderElementFrame(element, size),
    'terminal-ui-tests/components/async-leaf', 'leaf-1', 'Component render',
  );
  assert.throws(() => target.clear(), /drawing target is closed/u);
  await new Promise((resolve) => setImmediate(resolve));
});

test('composite before and after hooks reject promises with instance context', async () => {
  for (const phase of ['renderBeforeChildren', 'renderAfterChildren']) {
    const element = composite(phase, () => Promise.reject(new Error('late rejection')));
    assertPaintFailure(
      () => renderElementFrame(element, size),
      'terminal-ui-tests/components/async-composite', 'composite-1', `Component ${phase}`,
    );
  }
  await new Promise((resolve) => setImmediate(resolve));
  const element = composite('renderAfterChildren', ({ target }) => {
    target.write(0, 0, [{ text: 'Y' }]);
  });
  assert.equal(renderFramePlain(renderElementFrame(element, size)), 'Y');
});

test('canvas painter rejects thenables and closes drawing access', async () => {
  let painterCanvas;
  const element = canvas({
    id: 'async-canvas',
    painter({ canvas: drawing }) {
      painterCanvas = drawing;
      return { then(_resolve, reject) { reject(new Error('paint failed')); } };
    },
  });
  assertPaintFailure(
    () => renderElementFrame(element, size),
    'terminal-ui/components/canvas', 'async-canvas', 'Canvas painter',
  );
  assert.throws(() => painterCanvas.point(0, 0, { text: 'x' }), /drawing target is closed/u);
  await new Promise((resolve) => setImmediate(resolve));
});

test('async canvas painters cannot write after the rejected frame', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const element = canvas({
    id: 'delayed-canvas',
    async painter({ canvas: drawing }) {
      await gate;
      drawing.text(0, 0, [{ text: 'late' }]);
    },
  });
  assertPaintFailure(
    () => renderElementFrame(element, size),
    'terminal-ui/components/canvas', 'delayed-canvas', 'Canvas painter',
  );
  release();
  await new Promise((resolve) => setImmediate(resolve));
});

test('a rejected transform callback inside a painter retains component context', async () => {
  const element = canvas({
    id: 'transformed-canvas',
    painter({ canvas: drawing }) {
      drawing.withTransform({ translateX: 2 }, () => Promise.reject(new Error('draw failed')));
    },
  });
  assertPaintFailure(
    () => renderElementFrame(element, size),
    'terminal-ui/components/canvas', 'transformed-canvas', 'Canvas2D withTransform callback',
  );
  await new Promise((resolve) => setImmediate(resolve));
});

test('transform scopes reject async callbacks, isolate late writes, and preserve nested synchronous transforms', async () => {
  const buffer = createFrameBuffer(8, 1);
  const drawing = createCanvas2D(buffer, { row: 1, column: 1, width: 8, height: 1 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  assert.throws(() => drawing.withTransform({ translateX: 2 }, async (scoped) => {
    await gate;
    scoped.point(0, 0, { text: 'late' });
  }), /Canvas2D withTransform callback must complete synchronously/u);
  drawing.withTransform({ translateX: 2 }, (scoped) => {
    scoped.point(0, 0, { text: 'A' });
    scoped.withTransform({ translateX: 2 }, (nested) => {
      nested.point(0, 0, { text: 'B' });
    });
    scoped.point(1, 0, { text: 'C' });
  });
  drawing.point(0, 0, { text: 'O' });
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renderFramePlain(buffer.snapshot()), 'O ACB');
});
