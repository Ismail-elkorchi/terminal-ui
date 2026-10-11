import assert from 'node:assert/strict';
import test from 'node:test';

import { button } from '../../../dist/components/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';

test('button ignores internal-only fields without changing a wider caller object', () => {
  const options = Object.freeze({
    id: 'save',
    label: 'Save',
    inert: true,
    pressed: true,
    onPress: () => ({ kind: 'save' }),
  });
  const original = { ...options };
  const frame = renderElementFrame(button(options), { columns: 12, rows: 1 });

  assert.match(renderFramePlain(frame), /Save/u);
  assert.equal(frame.accessibility.root.id, 'save');
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.label, 'Save');
  assert.equal(Object.hasOwn(frame.accessibility.root, 'pressed'), false);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'save:control'));
  assert.deepEqual(options, original);
});

test('disabled button without a callback preserves its public semantics', () => {
  const options = Object.freeze({
    id: 'disabled-save',
    label: 'Save',
    disabled: true,
    inert: true,
    pressed: true,
  });
  const original = { ...options };
  const frame = renderElementFrame(button(options), { columns: 12, rows: 1 });

  assert.match(renderFramePlain(frame), /Save/u);
  assert.equal(frame.accessibility.root.id, 'disabled-save');
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.disabled, true);
  assert.equal(Object.hasOwn(frame.accessibility.root, 'pressed'), false);
  assert.deepEqual(frame.hitTargets ?? [], []);
  assert.deepEqual(options, original);
});
