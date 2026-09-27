import assert from 'node:assert/strict';
import test from 'node:test';
import { frameSnapshotMetadata } from '../../../dist/renderer/internal/frame-snapshot.js';
import { createLogHistory } from '../../../dist/behavior/log-history.js';
import { logViewer, text, textInput } from '../../../dist/components/index.js';
import { row, overlay } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';

test('unchanged painters on the same layer are retained while changed rows remain fresh', () => {
  const history = createLogHistory([{ id: '1', text: 'retained' }]);
  const view = count => row([logViewer({ id: 'log', history }), text({ content: `Count ${count}` })]);
  const size = { columns: 40, rows: 3 };
  const first = renderElementInternal(view(1), size);
  let retainedHooks = 0;
  let freshHooks = 0;
  const options = counter => ({ instrumentation: { now: () => 0, record() {}, recordWork(sample) {
    if (sample.kind === 'render_hooks') counter(sample.count);
  } } });
  const next = renderElementInternal(view(2), size, { previous: first, ...options(count => { retainedHooks += count; }) });
  const fresh = renderElementInternal(view(2), size, options(count => { freshHooks += count; }));
  assert.deepEqual(next.frame, fresh.frame);
  assert.ok(retainedHooks < freshHooks, `${retainedHooks} retained hooks vs ${freshHooks} fresh`);
  const beforeRows = frameSnapshotMetadata(first.frame).rowIndexes;
  const afterRows = frameSnapshotMetadata(next.frame).rowIndexes;
  for (const previous of beforeRows) {
    const current = afterRows.find(candidate => candidate.row === previous.row);
    if (current && JSON.stringify([...previous.cells]) === JSON.stringify([...current.cells])) assert.strictEqual(current, previous);
  }
});

test('a simultaneous state and focus change refreshes other layers', () => {
  const view = value => overlay([
    textInput({ id: 'first', meta: { accessibleName: 'First', layer: { zIndex: 2 } }, state: { text: '', cursor: 0 }, onTransition: () => 0 }),
    textInput({ id: 'second', meta: { accessibleName: 'Second', layer: { zIndex: 2 } }, state: { text: '', cursor: 0 }, onTransition: () => 0 }),
    text({ id: 'label', content: value, meta: { layer: { zIndex: 3 } } }),
  ], { id: 'layers' });
  const size = { columns: 20, rows: 2 };
  const first = renderElementInternal(view('old'), size, { focusPath: ['layers', 'first'] });
  const next = renderElementInternal(view('new'), size, { previous: first, focusPath: ['layers', 'second'] });
  const fresh = renderElementInternal(view('new'), size, { focusPath: ['layers', 'second'] });
  assert.deepEqual(next.frame, fresh.frame);
});
