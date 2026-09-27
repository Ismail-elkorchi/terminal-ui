import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory, appendLogHistory, logHistorySegments } from '../../../dist/behavior/log-history.js';


test('appends keep completed log segments stable and bound merge invalidation', () => {
  let history = createLogHistory(Array.from({ length: 256 }, (_, index) => ({ id: String(index), text: 'match' })));
  const original = logHistorySegments(history)[0];
  for (let index = 256; index < 800; index += 1) history = appendLogHistory(history, [{ id: String(index), text: 'match' }]);
  assert.strictEqual(logHistorySegments(history)[0], original);
  assert.ok(logHistorySegments(history).every(segment => segment.records.length <= 256));
});
