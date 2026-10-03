import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchPickerIndex, searchPickerEntryById } from '../../../dist/behavior/search-picker-index.js';

test('picker normalization skips short ASCII classification and reuses one fallback classifier', () => {
  const testCharacter = RegExp.prototype.test;
  const classifiers = new Set();
  let characters = 0;
  let index;
  RegExp.prototype.test = function (...args) {
    if (this.source === '\\s' && this.flags === 'u') {
      classifiers.add(this);
      characters += 1;
    }
    return Reflect.apply(testCharacter, this, args);
  };
  try {
    index = createSearchPickerIndex([
      { id: 'newline', label: 'A \u00a0\n\t B', value: 1 },
      { id: 'spaces', label: `  ${'x'.repeat(300)}  `, value: 2 },
      { id: 'unicode', label: 'é\u2028界', value: 3 },
      { id: 'long', label: 'x'.repeat(4096), value: 4 },
    ]);
  } finally {
    RegExp.prototype.test = testCharacter;
  }
  assert.ok(characters > 4096 && characters < 4196, 'Long/general fields use the fallback; the short 300-character ASCII field skips it');
  assert.equal(classifiers.size, 1, 'One stateless classifier serves all normalized characters');
  assert.equal(searchPickerEntryById(index, 'newline').label, 'A B');
  assert.equal(searchPickerEntryById(index, 'spaces').label, `  ${'x'.repeat(300)}  `);
  assert.equal(searchPickerEntryById(index, 'unicode').label, 'é\u2028界');
  assert.equal(searchPickerEntryById(index, 'long').label, 'x'.repeat(4096));
});
