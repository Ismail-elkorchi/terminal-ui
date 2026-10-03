import assert from 'node:assert/strict';
import test from 'node:test';
import { createTableCollection, prepareTableCollection, prepareTableRows, sortTableRows } from './table-operations.ts';
import { createTreeSource, prepareTreeSource, createTreeView, prepareTreeView } from './tree-operations.ts';
import { createLogHistory, prepareLogHistory, prepareAppendLogHistory, logHistoryEntries } from './log-history.ts';
import { prepareLogViewerView } from './log-viewer-view.ts';

void test('tree construction cooperates within one long label and owns source before yielding', async () => {
  const nodes = [{ kind: 'leaf' as const, id: 'one', label: 'x'.repeat(20_000) }];
  const node = nodes[0];
  assert.ok(node);
  const expected = createTreeSource(nodes);
  let yields = 0;
  const actual = await prepareTreeSource([nodes.map(node => ({ node }))], {
    signal: new AbortController().signal,
    yield: () => { yields += 1; node.label = 'mutated'; return Promise.resolve(); },
  });
  assert.ok(yields > 1);
  assert.deepEqual(createTreeView(actual, { expandedIds: [], selection: { mode: 'none' } }).collection.window(0, 1),
    createTreeView(expected, { expandedIds: [], selection: { mode: 'none' } }).collection.window(0, 1));
});

void test('log construction and append share normalization while cancellation preserves previous history', async () => {
  const history = createLogHistory([{ id: 'first', text: 'first' }]);
  const entries = [{ id: 'second', text: 'é'.repeat(20_000), metadata: { source: 'original' } }];
  const entry = entries[0];
  assert.ok(entry);
  const expected = createLogHistory(entries);
  const actual = await prepareLogHistory([entries], {
    signal: new AbortController().signal,
    yield: () => { entry.text = 'mutated'; entry.metadata.source = 'mutated'; return Promise.resolve(); },
  });
  assert.deepEqual(logHistoryEntries(actual), logHistoryEntries(expected));
  const controller = new AbortController();
  await assert.rejects(prepareAppendLogHistory(history, [[{ id: 'second', text: 'x'.repeat(20_000) }]], {
    signal: controller.signal,
    yield: () => { controller.abort(new Error('replaced')); return Promise.resolve(); },
  }), /replaced/u);
  assert.equal(history.entryCount, 1);
  assert.equal(logHistoryEntries(history)[0]?.text, 'first');
});

void test('log searching can cancel inside one long field with no matches', async () => {
  const history = createLogHistory([{ id: 'one', text: 'x'.repeat(100_000) }]);
  const controller = new AbortController();
  await assert.rejects(prepareLogViewerView({ history, query: { text: 'absent', mode: 'contains' } }, {
    signal: controller.signal,
    yield: () => { controller.abort(new Error('new query')); return Promise.resolve(); },
  }), /new query/u);
});

void test('table construction and stable sorting cooperate and preserve source membership', async () => {
  const rows = Array.from({ length: 2048 }, (_, i) => Object.freeze({ id: String(i), rank: 2048 - i }));
  const sort = { columnId: 'rank', direction: 'ascending' } as const;
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  const result = await prepareTableRows(createTableCollection(rows, row => row.id), sort, row => row.rank, context);
  assert.deepEqual(result, sortTableRows(rows, sort, row => row.rank));
  const controller = new AbortController();
  await assert.rejects(prepareTableCollection(Array.from({ length: 8 }, (_, i) => rows.slice(i * 256, (i + 1) * 256)), row => row.id, {
    signal: controller.signal,
    yield: () => { controller.abort(new Error('changed')); return Promise.resolve(); },
  }), /changed/u);
});

void test('huge tree and log queries can cancel during normalization before indexing', async () => {
  const source = createTreeSource([{ kind: 'leaf', id: 'one', label: 'tiny' }]);
  const history = createLogHistory([{ id: 'one', text: 'tiny' }]);
  for (const kind of ['tree', 'log'] as const) {
    const controller = new AbortController();
    let yields = 0;
    const context = { signal: controller.signal, yield: () => {
      yields += 1; controller.abort(new Error('new input')); return Promise.resolve();
    } };
    const query = { text: 'x'.repeat(2_000_000) };
    const work = kind === 'tree'
      ? prepareTreeView(source, { expandedIds: [], selection: { mode: 'none' }, query }, context)
      : prepareLogViewerView({ history, query }, context);
    await assert.rejects(work, /new input/u);
    assert.equal(yields, 1);
  }
});

void test('framework normalization cooperates inside long tab and control-sequence fields', async () => {
  for (const text of ['a\t'.repeat(20_000), '\u001b[31ma'.repeat(20_000)]) {
    const controller = new AbortController();
    let yields = 0;
    await assert.rejects(prepareLogHistory([[{ id: 'one', text }]], {
      signal: controller.signal,
      yield: () => { yields += 1; controller.abort(new Error('new source')); return Promise.resolve(); },
    }), /new source/u);
    assert.equal(yields, 1);
  }
});
