import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareTextAreaLayout, text, textArea } from '../../../dist/components/index.js';
import { column, splitPane } from '../../../dist/layout/index.js';
import { createTextDocument } from '../../../dist/text/index.js';
import { createVisualSnapshot } from '../../../dist/testing/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { layoutLifecycleMessages } from '../../../dist/tui/lifecycle/layout-lifecycle.js';

const size = { columns: 80, rows: 20 };
const prepareContext = () => ({ signal: new globalThis.AbortController().signal, yield: () => Promise.resolve() });
function options(extra = {}) {
  return { id: 'editor', meta: { accessibleName: 'Editor' },
    state: { document: createTextDocument('abcdefghij '.repeat(21)),
      caret: { position: { offset: 0, affinity: 'downstream' } },
      scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } },
    wrap: true, scrollbar: { visible: 'never' }, onTransition: () => ({ kind: 'edit' }), ...extra };
}
function tree(editor) {
  return column([
    text({ content: 'Header', id: 'header' }),
    splitPane([editor, text({ content: 'Other pane' })], {
      direction: 'horizontal', sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }], gap: 0,
    }),
    text({ content: 'Footer', id: 'footer' }),
  ]);
}
function render(value, commitId) {
  return { ...renderElementInternal(tree(textArea(value)), size), commitId, stateVersion: 0 };
}
function messages(current, previous) {
  return layoutLifecycleMessages(current, previous).map((entry) => entry.message);
}
function assertFreshParity(current, value) {
  const expected = render(value, 'fresh');
  const actualSnapshot = createVisualSnapshot({ frame: current.frame });
  const expectedSnapshot = createVisualSnapshot({ frame: expected.frame });
  for (const key of ['plainTextFrame', 'accessibilityJson', 'focusTargetJson', 'hitTargetJson']) {
    assert.equal(actualSnapshot[key], expectedSnapshot[key], key);
  }
  assert.deepEqual(current.layout.children.map((child) => child.bounds), expected.layout.children.map((child) => child.bounds));
}

async function settle(value, initial = null, previous) {
  let preparedLayout = initial;
  const requests = [];
  const allocations = [];
  for (let pass = 0; pass < 6; pass++) {
    const controlled = { ...value, preparedLayout,
      onLayoutRequest: (request) => ({ kind: 'request', request }),
      onLayout: (snapshot) => ({ kind: 'layout', snapshot }) };
    const current = render(controlled, String(pass));
    allocations.push(current.layout.children[1].children[0].bounds);
    const accepted = messages(current, previous);
    const request = accepted.find((message) => message.kind === 'request')?.request;
    if (request === undefined) {
      assertFreshParity(current, value);
      assert.equal(accepted.filter((message) => message.kind === 'layout').length, 1);
      const repeated = render(controlled, 'stable-ready');
      assert.deepEqual(messages(repeated, current), []);
      return { current, preparedLayout, requests, allocations };
    }
    assert.equal(accepted.some((message) => message.kind === 'layout'), false, 'pending frames cannot publish source geometry');
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(request.measurementWidths), true);
    requests.push(request);
    const repeated = render(controlled, 'stable-pending');
    assert.deepEqual(messages(repeated, current), [], 'unchanged pending frames do not resubmit work');
    preparedLayout = await prepareTextAreaLayout(request, prepareContext());
    previous = current;
  }
  assert.fail('controlled editor did not converge');
}

test('content-sized nested split panes prepare actual measurement widths before final allocation', async () => {
  const value = options();
  const settled = await settle(value);
  assert.equal(settled.requests.length, 2);
  assert.deepEqual(settled.requests.map((request) => request.measurementWidths), [[80], [80]]);
  assert.deepEqual(settled.allocations, [
    { row: 2, column: 1, width: 40, height: 1 },
    { row: 2, column: 1, width: 40, height: 3 },
    { row: 2, column: 1, width: 40, height: 3 },
  ]);
  assert.equal(settled.current.layout.children[2].bounds.row, 5,
    'substituting the final 40-column measurement would incorrectly move the footer to row 9');
});

test('controlled dependency changes re-enter pending without retaining stale measurements', async () => {
  const value = options();
  const first = await settle(value);
  const changed = { ...value, wrap: false, lineNumbers: true, error: 'Updated error' };
  const second = await settle(changed, first.preparedLayout, first.current);
  assert.ok(second.requests.length > 0);
  const nextDocument = { ...changed, state: { ...changed.state, document: createTextDocument('replacement\nsecond line') } };
  const third = await settle(nextDocument, second.preparedLayout, second.current);
  assert.ok(third.requests.length > 0);
  assert.equal(third.preparedLayout.document, nextDocument.state.document);
});

test('a request callback alone keeps deliberate synchronous mode and emits no preparation request', () => {
  const value = options();
  const current = render({ ...value,
    onLayoutRequest: (request) => ({ kind: 'request', request }),
    onLayout: (snapshot) => ({ kind: 'layout', snapshot }) }, 'direct');
  const accepted = messages(current);
  assert.deepEqual(accepted.map((message) => message.kind), ['layout']);
  assertFreshParity(current, value);
});
