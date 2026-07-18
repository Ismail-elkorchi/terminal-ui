import assert from 'node:assert/strict';
import test from 'node:test';
import { activeScreen, screenStackReducer } from '../../dist/behavior/index.js';

test('screen column supports push, pop, replace, reset, and active screen lookup', () => {
  const first = { id: 'home', state: { path: '/' } };
  const second = { id: 'details', state: { path: '/details' } };
  const pushed = screenStackReducer({ screens: [first] }, { kind: 'push', screen: second });
  assert.equal(activeScreen(pushed)?.id, 'details');

  const replaced = screenStackReducer(pushed, { kind: 'replace', screen: { id: 'settings', state: {} } });
  assert.deepEqual(replaced.screens.map((screen) => screen.id), ['home', 'settings']);

  const popped = screenStackReducer(replaced, { kind: 'pop' });
  assert.deepEqual(popped.screens.map((screen) => screen.id), ['home']);

  const reset = screenStackReducer(popped, { kind: 'reset', screens: [] });
  assert.equal(activeScreen(reset), undefined);
});
