import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../../../dist/behavior/log-history.js';
import { prepareLogViewerView, createLogViewerView } from '../../../dist/behavior/index.js';
import { compileCollectionQuery } from '../../../dist/text/query.js';

test('cooperative log search yields, cancels without publishing partial results, and resumes correctly', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'needle' })));
  const query = compileCollectionQuery({ text: 'needle' });
  const controller = new globalThis.AbortController();
  let yields = 0;
  await assert.rejects(prepareLogViewerView({ history, query }, {
    signal: controller.signal,
    yield: async () => { yields += 1; controller.abort(new Error('cancelled search')); },
  }), /cancelled search/u);
  assert.equal(yields, 1);
  await prepareLogViewerView({ history, query }, {
    signal: new globalThis.AbortController().signal,
    yield: async () => { yields += 1; },
  });
  assert.ok(yields > 1);
  assert.equal(createLogViewerView({ history, query }).matchingEntries, 6000);
});
