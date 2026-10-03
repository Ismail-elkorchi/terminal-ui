import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchPickerIndex, prepareSearchPickerQuery, querySearchPickerIndex } from '../../../dist/behavior/search-picker-index.js';
import { createListboxCollection, prepareListboxView, createTreeSource, prepareTreeView } from '../../../dist/behavior/index.js';

const context = () => ({ signal: new globalThis.AbortController().signal, operationLimit: 8, yield: async () => {} });
test('concurrent picker, listbox and tree preparations reuse atomically admitted projections', async () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: String(index), label: `match ${String(index)}`, value: index }));
  const query = { text: 'match', mode: 'contains' };
  const picker = createSearchPickerIndex(rows);
  const listbox = createListboxCollection(rows, value => value);
  const tree = createTreeSource(rows.map(row => ({ ...row, kind: 'leaf' })));
  const state = { expandedIds: [], selection: { mode: 'none' }, query };
  for (const prepare of [
    () => prepareSearchPickerQuery(picker, query, context()),
    () => prepareListboxView(listbox, { query }, context()),
    () => prepareTreeView(tree, state, context()),
  ]) {
    const [first, second] = await Promise.all([prepare(), prepare()]);
    assert.equal(first, second);
  }
});


test('empty picker queries share base order methods and retain no match projection', () => {
  const picker = createSearchPickerIndex([{ id: 'a', label: 'A', value: 1 }, { id: 'b', label: 'B', value: 2, disabled: true }]);
  const fuzzy = querySearchPickerIndex(picker, { text: '', mode: 'fuzzy' });
  const contains = querySearchPickerIndex(picker, { text: '', mode: 'contains' });
  assert.equal(fuzzy.entryAt, contains.entryAt);
  assert.equal(fuzzy.window, contains.window);
  assert.equal(fuzzy.interactionIndex, contains.interactionIndex);
  assert.equal(fuzzy.matches.length, 0);
});

test('ranked owned references preserve unequal scores, stable ties and primary Unicode highlights', async () => {
  const { createListboxView } = await import('../../../dist/behavior/index.js');
  const rows = [
    { id: 'later', label: 'xxCafe\u0301', description: 'other', value: 1 },
    { id: 'first', label: 'Cafe\u0301', description: 'other', value: 2, disabled: true },
    { id: 'tie', label: 'Cafe\u0301', description: 'other', value: 3 },
    { id: 'secondary', label: 'unrelated', description: 'Cafe\u0301', value: 4 },
  ];
  const picker = createSearchPickerIndex(rows);
  const listbox = createListboxCollection(rows, value => value);
  const query = { text: 'café', mode: 'contains' };
  const picked = querySearchPickerIndex(picker, query);
  assert.deepEqual(picked.matches.map(match => match.id), ['first', 'tie', 'secondary', 'later']);
  assert.deepEqual(picked.window(0, picked.count).map(entry => entry.id), picked.matches.map(match => match.id));
  const viewed = createListboxView(listbox, { query });
  assert.deepEqual(viewed.window(0, viewed.count).map(entry => entry.id), ['first', 'tie', 'later', 'secondary']);
  assert.deepEqual(viewed.entryById('first').matches, [{ field: 'primary', fieldIndex: 0, start: 0, end: 5 }]);
  assert.equal(viewed.entryById('secondary').matches, undefined);
  assert.equal(viewed.entryById('first').selectableIndex, undefined);
  assert.equal(viewed.entryById('tie').selectableIndex, 0);
});

test('picker and listbox projection preparation never rehash matched source identities', async () => {
  const { createListboxView } = await import('../../../dist/behavior/index.js');
  const rows = Array.from({ length: 32 }, (_, rank) => ({ id: `identity-${String(rank)}-${'x'.repeat(1024)}`, label: rank % 2 ? 'hit' : 'later hit', value: rank }));
  const picker = createSearchPickerIndex(rows);
  const listbox = createListboxCollection(rows, value => value);
  let hashes = 0;
  const imul = Math.imul;
  try {
    Math.imul = (...arguments_) => { hashes += 1; return imul(...arguments_); };
    assert.equal(querySearchPickerIndex(picker, { text: 'hit', mode: 'contains' }).count, rows.length);
    assert.equal(createListboxView(listbox, { query: { text: 'hit', mode: 'contains' } }).count, rows.length);
  } finally { Math.imul = imul; }
  assert.equal(hashes, 0, 'Matched owners must flow from the scan; persistent identity recovery hashes each ID');
});
