import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../../../dist/behavior/log-history.js';
import { preparedLogLayout } from '../../../dist/behavior/log-viewer-view.js';
import { createLogViewerView } from '../../../dist/behavior/index.js';
import { unwrappedLogViewerLayout, visibleLogViewerRecords } from '../../../dist/behavior/log-viewer-layout.js';
import { defaultTextWidthProfile } from '../../../dist/text/index.js';

test('unwrapped geometry indexes visible source rows and prepared wrapping retains exact geometry', () => {
  const history = createLogHistory(Array.from({ length: 10_000 }, (_, index) => ({ id: String(index), text: 'first\nsecond' })));
  const first = unwrappedLogViewerLayout(history);
  assert.equal(first.totalRows, 10_000);
  assert.equal(first.segments.length, 0, 'unwrapped geometry must not materialize whole-history segment layouts');
  assert.strictEqual(unwrappedLogViewerLayout(history), first);
  assert.deepEqual(visibleLogViewerRecords(first, 9998, 10_000).map(item => item.record.entry.id), ['9998', '9999']);
  const input = { history, wrap: true, width: 40, widthProfile: defaultTextWidthProfile, foldedIds: ['3', '7'] };
  const wrapped = createLogViewerView(input);
  const reused = createLogViewerView(input);
  assert.strictEqual(preparedLogLayout(reused, 40), preparedLogLayout(wrapped, 40));
  assert.strictEqual(preparedLogLayout(reused, 39), preparedLogLayout(wrapped, 39));
});
