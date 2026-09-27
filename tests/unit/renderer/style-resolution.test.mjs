import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultStyleForState
} from '../../../dist/renderer/style-resolution.js';

const foreground = (token, extra = {}) => ({
  fg: { kind: 'theme', token },
  ...extra
});

test('default state styles cover interaction branches without result styling', () => {
  const selection = {
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true
  };
  const cases = [
    ['default', undefined],
    ['focused', { bold: true }],
    ['hovered', { bg: { kind: 'theme', token: 'focus.background' } }],
    ['pressed', { bold: true }],
    ['selected', selection],
    ['disabled', foreground('text.disabled', { dim: true })],
    ['active', { bold: true }]
  ];

  for (const [state, expected] of cases) {
    assert.deepEqual(defaultStyleForState(state), expected, state);
  }
  for (const state of ['selected', 'focused', 'disabled']) {
    assert.notEqual(defaultStyleForState(state)?.fg?.token, 'status.error', state);
  }
  for (const outcome of ['error', 'warning', 'success']) {
    assert.equal(defaultStyleForState(outcome), undefined, outcome);
  }
});
