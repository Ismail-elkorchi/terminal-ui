import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pointerInteractionReducer
} from '../../dist/behavior/index.js';

void test('pointer interaction reducer keeps hover and press state caller-controlled', () => {
  const hovered = pointerInteractionReducer({}, { kind: 'enter', targetId: 'button-a' });
  const pressed = pointerInteractionReducer(hovered, { kind: 'press', targetId: 'button-a' });
  const released = pointerInteractionReducer(pressed, { kind: 'release', targetId: 'button-a' });
  const cleared = pointerInteractionReducer(released, { kind: 'leave', targetId: 'button-a' });

  assert.deepEqual(hovered, { hoveredTargetId: 'button-a' });
  assert.deepEqual(pressed, { hoveredTargetId: 'button-a', pressedTargetId: 'button-a' });
  assert.deepEqual(released, { hoveredTargetId: 'button-a' });
  assert.deepEqual(cleared, {});
});
