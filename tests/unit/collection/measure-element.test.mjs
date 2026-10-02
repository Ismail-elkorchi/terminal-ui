import assert from 'node:assert/strict';
import test from 'node:test';
import { measureElement } from '../../../dist/renderer/measure-element.js';
import { richText } from '../../../dist/components/index.js';

test('public preparation uses component measurement without rendering or layout effects', () => {
  const element = richText({ segments: [{ kind: 'text', text: 'word '.repeat(30) }], wrap: true });
  const wide = measureElement(element, { columns: 40, rows: 100 });
  const narrow = measureElement(element, { columns: 10, rows: 100 });
  assert.ok(narrow.preferredHeight > wide.preferredHeight);
  assert.deepEqual(measureElement(element, { columns: 40, rows: 100 }), wide);
  assert.throws(() => measureElement(element, { columns: -1, rows: 10 }));
});
