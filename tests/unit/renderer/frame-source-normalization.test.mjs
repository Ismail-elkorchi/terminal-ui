import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFrameCellSource, deriveFrameCellSource } from '../../../dist/visual/frame-source.js';

test('source normalization preserves canonical field order, sanitization and omission', () => {
  const source = decodeFrameCellSource({
    description: 'desc\u001b[31mription', interactionState: 'focused', itemIndex: 0,
    itemId: 'item', partType: 'body', partName: 'label', cellRole: 'text',
    rendererFamily: 'family', elementKind: 'text', elementId: 'source', ignored: 'value',
  });
  assert.deepEqual(Object.keys(source), ['elementId', 'elementKind', 'rendererFamily', 'cellRole',
    'partName', 'partType', 'itemId', 'itemIndex', 'interactionState', 'description']);
  assert.equal(source.description, 'description');
  assert.ok(Object.isFrozen(source));
  assert.deepEqual(decodeFrameCellSource({ elementId: '', partName: 12, description: '\u001b[31m' }), {});
  assert.equal(decodeFrameCellSource({ ...source }), source);
  assert.equal(decodeFrameCellSource(source), source);
});

test('normalizing mutable sources does not freeze or cache caller-owned state', () => {
  const input = { elementId: 'before' };
  const before = decodeFrameCellSource(input);
  assert.equal(Object.isFrozen(input), false);
  input.elementId = 'after';
  assert.equal(before.elementId, 'before');
  assert.equal(decodeFrameCellSource(input).elementId, 'after');
  const fields = { partName: 'part' };
  const derived = deriveFrameCellSource(before, fields);
  fields.partName = 'changed';
  assert.equal(derived.partName, 'part');
  assert.equal(Object.isFrozen(fields), false);
});

test('source validation reads fields in order and reports the first invalid field', () => {
  const read = [];
  const keys = ['elementId', 'elementKind', 'rendererFamily', 'cellRole', 'partName',
    'partType', 'itemId', 'itemIndex', 'interactionState', 'description'];
  const source = Object.fromEntries(keys.map(key => [key, undefined]));
  const tracked = new Proxy(source, { get(target, key) { read.push(key); return target[key]; } });
  decodeFrameCellSource(tracked);
  assert.deepEqual(read, keys);
  assert.throws(() => decodeFrameCellSource({ cellRole: 'invalid', itemIndex: -1 }),
    /^TypeError: Frame cell source cellRole must be one of /u);
  assert.throws(() => decodeFrameCellSource({ itemIndex: -1, interactionState: 'invalid' }),
    { name: 'TypeError', message: 'Frame cell source itemIndex must be a non-negative integer.' });
  for (const itemIndex of [null, '1', NaN, Infinity, 1.5]) {
    assert.throws(() => decodeFrameCellSource({ itemIndex }), /itemIndex must be a non-negative integer/u);
  }
  assert.throws(() => decodeFrameCellSource({ interactionState: 'default' }), /interactionState must be one of /u);
});
