import assert from 'node:assert/strict';
import test from 'node:test';
import { activeNavigationEntry, navigationStackReducer } from '../../dist/behavior/index.js';

test('navigation stack supports push, pop, replace, reset, and active-entry lookup', () => {
  const first = { id: 'home', state: { path: '/' } };
  const second = { id: 'details', state: { path: '/details' } };
  const pushed = navigationStackReducer({ entries: [first] }, { kind: 'push', entry: second });
  assert.equal(activeNavigationEntry(pushed)?.id, 'details');

  const replaced = navigationStackReducer(pushed, { kind: 'replace', entry: { id: 'settings', state: {} } });
  assert.deepEqual(replaced.entries.map((entry) => entry.id), ['home', 'settings']);

  const popped = navigationStackReducer(replaced, { kind: 'pop' });
  assert.deepEqual(popped.entries.map((entry) => entry.id), ['home']);

  const reset = navigationStackReducer(popped, { kind: 'reset', entries: [] });
  assert.equal(activeNavigationEntry(reset), undefined);
});
