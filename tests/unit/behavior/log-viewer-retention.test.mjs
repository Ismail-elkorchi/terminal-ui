import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const historyModule = new URL('../../../dist/behavior/log-history.js', import.meta.url).href;
const viewModule = new URL('../../../dist/behavior/log-viewer-view.js', import.meta.url).href;

function withGarbageCollection(source) {
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { setImmediate } from 'node:timers/promises';
    import { createLogHistory, appendLogHistory } from ${JSON.stringify(historyModule)};
    import { createLogViewerView, prepareLogViewerView } from ${JSON.stringify(viewModule)};
    async function collect() {
      for (let iteration = 0; iteration < 5; iteration++) {
        await setImmediate();
        global.gc();
      }
    }
    ${source}
  `], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
}

test('discarded large log searches release occurrences while their histories stay alive', () => {
  withGarbageCollection(`
    for (const entries of [
      [{ id: 'large-record', text: 'needle '.repeat(50000) }],
      Array.from({ length: 9000 }, (_, index) => ({ id: String(index), text: 'needle' })),
    ]) {
      const history = createLogHistory(entries);
      const references = (() => {
        const view = createLogViewerView({ history, query: { text: 'needle' } });
        return [new WeakRef(view), new WeakRef(view.matches), new WeakRef(view.matches[0])];
      })();
      await collect();
      assert.ok(references.every(reference => reference.deref() === undefined),
        'the history must not own discarded large search results or individual occurrences');
      assert.equal(history.entryCount, entries.length);
    }
  `);
});

test('retained large log views preserve query and per-record reuse across garbage collection', () => {
  withGarbageCollection(`
    const history = createLogHistory(Array.from({ length: 9000 }, (_, index) => ({ id: String(index), text: 'needle' })));
    const query = { text: 'needle' };
    const view = createLogViewerView({ history, query });
    await collect();
    let yields = 0;
    const next = await prepareLogViewerView({ history, query }, {
      signal: new AbortController().signal,
      yield: async () => { yields++; },
    });
    assert.equal(next.matches, view.matches);
    assert.equal(yields, 0, 'an accepted view must retain its complete query for resize and redraw');
    const appended = createLogViewerView({ history: appendLogHistory(history, [{ id: 'appended', text: 'needle' }]), query });
    assert.equal(appended.matches.length, 9001);
    assert.equal(appended.matches[0], view.matches[0], 'retained immutable records reuse their occurrences');
  `);
});
