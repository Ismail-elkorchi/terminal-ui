import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWork, prepareWork } from '../foundation/cooperative-work.ts';
import { createSearchPickerIndex, prepareSearchPickerIndex, querySearchPickerIndex, searchPickerEntryById } from '../behavior/search-picker-index.ts';
import { cleanSearchFieldWork } from './clean-search-field.ts';
import { projectTerminalSingleLineText, sanitizeTerminalCellText, sanitizeTerminalSingleLineText, sanitizeTerminalText, sanitizeTerminalTextWork } from './sanitize.ts';

void test('bounded picker field cleaning preserves spaces, Unicode, controls and original highlight offsets', async () => {
  const values = ['', ' ASCII  I ', 'x'.repeat(2048), 'x'.repeat(2049), 'Cafe\u0301 CAFÉ', '\tA\r\n B\n\tC', '\u001b[31mred\u001b[0m', 'a\u00a0\n\u2003b', 'a\u0000b', '👨‍👩‍👧‍👦'];
  const source = values.map((label, i) => ({ id: `id${String(i)}`, value: i, label, description: label, keywords: [label], group: label, preview: label }));
  const sync = createSearchPickerIndex(source);
  const asyncIndex = await prepareSearchPickerIndex([source], { signal: new AbortController().signal, operationLimit: 32, yield: () => Promise.resolve() });
  for (const [i, value] of values.entries()) {
    const expected = sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
    assert.equal(finishWork(cleanSearchFieldWork(value)), expected);
    for (const index of [sync, asyncIndex]) {
      const entry = searchPickerEntryById(index, `id${String(i)}`);
      assert.ok(entry);
      assert.equal(entry.label, expected);
      assert.equal(entry.description, expected);
      assert.deepEqual(entry.keywords, [expected]);
      assert.equal(entry.group, expected);
      assert.equal(entry.preview, expected);
    }
  }
  for (const mode of ['exact', 'contains', 'prefix', 'fuzzy'] as const) {
    for (const text of ['ASCII', 'café', 'red', '👨‍👩‍👧‍👦', 'xxx']) {
      const query = { text, mode };
      assert.deepEqual(querySearchPickerIndex(asyncIndex, query).matches, querySearchPickerIndex(sync, query).matches);
    }
  }
  assert.deepEqual(querySearchPickerIndex(sync, { text: 'café', mode: 'prefix' }).matches[0]?.ranges, [
    { field: 'primary', fieldIndex: 0, start: 0, end: 5 },
  ]);
});

void test('bounded field cleaning charges validation and cancels before publication', async () => {
  const field = cleanSearchFieldWork('UNCHANGED');
  assert.deepEqual(field.next(), { done: false, value: 9 });
  assert.deepEqual(field.next(), { done: true, value: 'UNCHANGED' });
  for (const label of ['A'.repeat(2048), 'A'.repeat(8192), 'a\n'.repeat(4096), 'e\u0301'.repeat(4096)]) {
    const controller = new AbortController();
    await assert.rejects(prepareSearchPickerIndex([[{ id: 'id', label, value: 0 }]], {
      signal: controller.signal, operationLimit: 32,
      yield: () => { controller.abort(new Error('cancel fields')); return Promise.resolve(); },
    }), /cancel fields/u);
  }
  for (const bad of [null, {}, { id: 1, label: 'ok' }, { id: 'ok', label: [] }, { id: 'ok', label: 'ok', keywords: [1] }]) {
    assert.throws(() => createSearchPickerIndex([bad] as never), TypeError);
    await assert.rejects(prepareSearchPickerIndex([[bad]] as never, { signal: new AbortController().signal, operationLimit: 32, yield: () => Promise.resolve() }), TypeError);
  }
});

void test('sanitizer modes, replacement validation and editable offset mapping remain unchanged', async () => {
  const source = 'A\u001b[31mB\u001b[0m\tC\r\nD';
  const result = sanitizeTerminalText(source, { replacement: '?' });
  assert.equal(result.text, 'A?B?    C\nD');
  assert.deepEqual(result.removedControlSequences, [
    { sequence: '\u001b[31m', codeUnitOffset: 1, kind: 'escape' },
    { sequence: '\u001b[0m', codeUnitOffset: 7, kind: 'escape' },
  ]);
  for (const replacement of ['\n', '\r', '\t', '\u001b[31m', '\u0000']) {
    assert.throws(() => sanitizeTerminalText('SAFE', { replacement }), TypeError);
    await assert.rejects(prepareWork(sanitizeTerminalTextWork('SAFE', { replacement }), { signal: new AbortController().signal, operationLimit: 1, yield: () => Promise.resolve() }), TypeError);
  }
  assert.equal(sanitizeTerminalSingleLineText('a\nb').text, 'a b');
  assert.equal(sanitizeTerminalCellText('a\nb').text, 'ab');
  const projected = projectTerminalSingleLineText('a\u001b[31mb\r\nc');
  assert.equal(projected.text, 'ab c');
  assert.deepEqual([0, 1, 6, 7, 9, 10].map(offset => projected.sourceOffsetToDisplay(offset)), [0, 1, 1, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 4].map(offset => projected.displayOffsetToSource(offset)), [0, 6, 7, 9, 10]);
});
