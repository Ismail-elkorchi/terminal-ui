import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../../../dist/behavior/log-history.js';
import { prepareLogViewerSearch, searchLogViewerHistory } from '../../../dist/components/log-viewer/layout.js';
import { compileCollectionQuery } from '../../../dist/text/query.js';
import { logViewer } from '../../../dist/components/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';

test('cooperative log search yields, cancels without publishing partial results, and resumes correctly', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'needle' })));
  const query = compileCollectionQuery({ text: 'needle' });
  const controller = new globalThis.AbortController();
  let yields = 0;
  await assert.rejects(prepareLogViewerSearch(history, query, new Set(), {
    signal: controller.signal,
    yield: async () => { yields += 1; controller.abort(new Error('cancelled search')); },
  }), /cancelled search/u);
  assert.equal(yields, 1);
  await prepareLogViewerSearch(history, query, new Set(), {
    signal: new globalThis.AbortController().signal,
    yield: async () => { yields += 1; },
  });
  assert.ok(yields > 1);
  assert.equal(searchLogViewerHistory(history, query, new Set()).matchingEntries, 6000);
});

test('runtime prepares interactive log search through the host scheduler before committing', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'runtime needle' })));
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 8 } });
  let batches = 0;
  const host = { ...memory, clock: {
    now: () => memory.clock.now(),
    sleep: (ms, signal) => { if (ms === 0) batches += 1; return memory.clock.sleep(ms, signal); },
  } };
  const app = defineTui({ id: 'prepared-log-search', init: () => ({ state: 0 }), update: state => ({ state }),
    view: () => logViewer({ id: 'prepared-log', history, query: { text: 'needle' }, onTransition: value => value }),
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    assert.ok(batches >= 2, `expected scheduler batches, got ${batches}`);
    assert.match(JSON.stringify(runtime.frame().accessibility), /Matching entries: 6000/u);
  } finally {
    await runtime.dispose();
  }
});
