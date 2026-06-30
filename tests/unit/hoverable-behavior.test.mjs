import assert from 'node:assert/strict';
import test from 'node:test';

import { hoverableActive, hoverableReducer } from '../../dist/widgets/index.js';

test('hoverableReducer keeps hover and focus state caller-owned and explicit', () => {
  const hovered = hoverableReducer({}, { kind: 'enter', id: 'button-a' });
  const focused = hoverableReducer(hovered, { kind: 'focus', id: 'field-b' });
  const stillFocused = hoverableReducer(focused, { kind: 'leave', id: 'button-a' });
  const cleared = hoverableReducer(stillFocused, { kind: 'blur', id: 'field-b' });

  assert.deepEqual(hovered, { hoveredId: 'button-a' });
  assert.deepEqual(focused, { hoveredId: 'button-a', focusedId: 'field-b' });
  assert.equal(hoverableActive(focused, 'button-a'), true);
  assert.equal(hoverableActive(focused, 'field-b'), true);
  assert.equal(hoverableActive(focused, 'other'), false);
  assert.deepEqual(stillFocused, { focusedId: 'field-b' });
  assert.deepEqual(cleared, {});
});
