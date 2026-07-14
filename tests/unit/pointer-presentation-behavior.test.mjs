import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pointerPresentationReducer
} from '../../dist/behavior/index.js';

test('pointer presentation reducer keeps hover and press state caller-owned', () => {
  const hovered = pointerPresentationReducer({}, { kind: 'enter', targetId: 'button-a' });
  const pressed = pointerPresentationReducer(hovered, { kind: 'press', targetId: 'button-a' });
  const released = pointerPresentationReducer(pressed, { kind: 'release', targetId: 'button-a' });
  const cleared = pointerPresentationReducer(released, { kind: 'leave', targetId: 'button-a' });

  assert.deepEqual(hovered, { hoveredTargetId: 'button-a' });
  assert.deepEqual(pressed, { hoveredTargetId: 'button-a', pressedTargetId: 'button-a' });
  assert.deepEqual(released, { hoveredTargetId: 'button-a' });
  assert.deepEqual(cleared, {});
});
