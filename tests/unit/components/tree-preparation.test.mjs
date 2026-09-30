import assert from 'node:assert/strict';
import test from 'node:test';
import { createTreeSource, createTreeView, prepareTreeView, treeReducer, visibleTreeRows } from '../../../dist/behavior/index.js';
import { collectionItemById } from '../../../dist/collection/index.js';
import { collectionInteractionIds } from '../../../dist/interaction/collection-interaction.js';
import { tree } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const stateFor = text => ({ expandedIds: [], selection: { mode: 'single' }, query: { text } });
const context = () => ({ signal: new globalThis.AbortController().signal, yield: async () => {} });
function largeSource(size = 4096) {
  return createTreeSource([{ id: 'root', label: 'Root', kind: 'branch', children:
    Array.from({ length: size }, (_, index) => ({ id: String(index), label: `needle ${String(index)}`, kind: 'leaf' })),
  }]);
}

test('cooperative tree projection preserves ancestors, ordering, expansion, lazy rows and selection', async () => {
  const source = createTreeSource([
    { id: 'a', label: 'A', kind: 'branch', children: [
      { id: 'x', label: 'needle', kind: 'leaf' },
      { id: 'b', label: 'B', kind: 'branch', children: [{ id: 'z', label: 'needle', kind: 'leaf', disabled: true }] },
    ] },
    { id: 'remote', label: 'Remote', kind: 'lazy' },
  ]);
  for (const state of [stateFor('needle'), { ...stateFor(''), expandedIds: ['a', 'remote'], loadStatusById: { remote: { kind: 'pending', message: 'Waiting' } } }]) {
    const expected = visibleTreeRows(source, state);
    const view = await prepareTreeView(source, state, context());
    assert.deepEqual(view.collection.items.map(item => item.row), expected);
    assert.equal(createTreeView(source, state), view);
    assert.equal(collectionItemById(view.collection, 'x')?.itemIndex, 1);
    const active = treeReducer(state, { kind: 'setActive', id: 'x' }, { source, view });
    assert.equal(active.activeId, 'x');
    assert.equal(treeReducer(active, { kind: 'commitActive' }, { source, view }).selection.selectedId, 'x');
  }
  const filtered = await prepareTreeView(source, stateFor('needle'), context());
  assert.deepEqual(filtered.collection.items.map(item => item.id), ['a', 'x', 'b', 'z']);
  assert.deepEqual(collectionInteractionIds(filtered.interactionIndex), ['a', 'x', 'b']);
});

test('tree scan, row projection, collection ownership and navigation indexing all yield and cancel atomically', async () => {
  for (const cancelAt of [1, 18, 35, 52, 69]) {
    const source = largeSource();
    const state = stateFor('needle');
    const controller = new globalThis.AbortController();
    let batches = 0;
    await assert.rejects(prepareTreeView(source, state, {
      signal: controller.signal,
      yield: async () => { if (++batches === cancelAt) controller.abort(new Error('cancelled tree')); },
    }), /cancelled tree/u);
    assert.equal(batches, cancelAt);
    let resumedBatches = 0;
    const result = await prepareTreeView(source, state, {
      signal: new globalThis.AbortController().signal, yield: async () => { resumedBatches += 1; },
    });
    assert.ok(resumedBatches > 69, 'cancelled work must not install a partial or complete projection');
    assert.equal(result.collection.totalCount, 4097);
    assert.equal(collectionItemById(result.collection, '4095')?.itemIndex, 4096);
  }
});

test('pending navigation avoids scanning and rejects stale prepared projections', async () => {
  const source = largeSource();
  const state = stateFor('needle');
  assert.equal(treeReducer(state, { kind: 'moveActive', delta: 1 }, { source, view: null }), state);
  const changed = treeReducer(state, { kind: 'setQuery', query: { text: '4095' } }, { source, view: null });
  const view = await prepareTreeView(source, state, context());
  assert.throws(() => treeReducer(changed, { kind: 'moveActive', delta: 1 }, { source, view }), /projection state/u);
  assert.throws(() => treeReducer(state, { kind: 'moveActive', delta: 1 }, { source: largeSource(1), view }), /source/u);
  const expanded = treeReducer(state, { kind: 'expand', id: 'root' }, { source, view: null });
  assert.deepEqual(expanded.expandedIds, ['root']);
});

test('a newer tree query can finish while an older query is paused and aborted', async () => {
  const source = largeSource();
  const controller = new globalThis.AbortController();
  const entered = Promise.withResolvers();
  const released = Promise.withResolvers();
  const older = prepareTreeView(source, stateFor('needle'), {
    signal: controller.signal,
    yield: async () => { entered.resolve(); await released.promise; },
  });
  await entered.promise;
  const latestState = stateFor('4095');
  const latest = await prepareTreeView(source, latestState, context());
  assert.deepEqual(latest.collection.items.map(item => item.id), ['root', '4095']);
  controller.abort(new Error('superseded'));
  released.resolve();
  await assert.rejects(older, /superseded/u);
  assert.equal(createTreeView(source, latestState), latest);
});

test('tree component construction leaves scan work for scheduler preparation', async () => {
  const source = largeSource();
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 30, rows: 4 } });
  let batches = 0;
  const host = { ...memory, clock: { now: () => memory.clock.now(), sleep: (ms, signal) => {
    if (ms === 0) batches += 1;
    return memory.clock.sleep(ms, signal);
  } } };
  const app = defineTui({ id: 'prepared-tree', init: () => ({ state: stateFor('needle') }),
    update: state => ({ state }), view: state => tree({ id: 'tree', meta: { accessibleName: 'Tree' }, source, state, onTransition: value => value }),
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    assert.ok(batches > 69, `expected cooperative tree work, got ${String(batches)} batches`);
    assert.match(JSON.stringify(runtime.frame().accessibility), /4097 tree rows/u);
  } finally { await runtime.dispose(); }
});

test('disposing runtime aborts pending tree preparation without painting partial rows', async () => {
  const source = largeSource();
  const memory = createMemoryTerminalHost();
  const began = Promise.withResolvers();
  let aborted = false;
  const host = { ...memory, clock: { now: () => memory.clock.now(), sleep: (ms, signal) => {
    if (ms !== 0) return memory.clock.sleep(ms, signal);
    return new Promise(resolve => {
      signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
      began.resolve();
    });
  } } };
  const runtime = createTuiRuntime({ host, app: defineTui({ id: 'cancelled-tree', init: () => ({ state: stateFor('needle') }),
    update: state => ({ state }), view: state => tree({ id: 'tree', meta: { accessibleName: 'Tree' }, source, state, onTransition: value => value }),
  }) });
  const starting = assert.rejects(runtime.start(), error => error.phase === 'prepare');
  await began.promise;
  await runtime.dispose();
  await starting;
  assert.equal(aborted, true);
  assert.equal(memory.output(), '');
  assert.equal(runtime.frame(), undefined);
});
