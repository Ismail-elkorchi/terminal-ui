import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultStyleForPart,
  defaultStyleForState,
  defaultStyleForTextRole
} from '../../dist/renderer/internal/render-node-style.js';
import {
  statusMarker,
  statusStyle,
  statusToken
} from '../../dist/renderer/internal/status-visual.js';
import { defaultTheme } from '../../dist/theme/index.js';

const foreground = (token, extra = {}) => ({
  fg: { kind: 'theme', token },
  ...extra
});

test('default part styles cover structural and interaction parts only', () => {
  const selection = {
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true
  };
  const cases = [
    ['root', foreground('text.default')],
    ['content', foreground('text.default')],
    ['value', foreground('text.default')],
    ['border', foreground('surface.border')],
    ['title', foreground('surface.title', { bold: true })],
    ['label', foreground('text.strong')],
    ['placeholder', foreground('input.placeholder', { dim: true })],
    ['selected', selection],
    ['focused', { bold: true }],
    ['disabled', foreground('text.disabled', { dim: true })]
  ];

  for (const [part, expected] of cases) {
    assert.deepEqual(defaultStyleForPart(part), expected, part);
  }
  for (const outcome of ['error', 'warning', 'success']) {
    assert.equal(defaultStyleForPart(outcome), undefined, outcome);
  }
  assert.equal(defaultStyleForPart('caller-defined'), undefined);
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
    ['pressed', selection],
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

test('default text roles cover every branch', () => {
  const cases = [
    ['title', foreground('surface.title', { bold: true })],
    ['subtitle', foreground('text.muted', { dim: true })],
    ['heading', foreground('text.strong', { bold: true })],
    ['body', foreground('text.default')],
    ['caption', foreground('text.muted', { dim: true })],
    ['metadata', foreground('text.muted', { dim: true })],
    ['metric', foreground('accent.primary', { bold: true })],
    ['badge', {
      fg: { kind: 'theme', token: 'badge.foreground' },
      bg: { kind: 'theme', token: 'badge.background' },
      bold: true
    }],
    ['danger', foreground('status.error', { bold: true })],
    ['warning', foreground('status.warning', { bold: true })],
    ['success', foreground('status.success', { bold: true })]
  ];

  for (const [role, expected] of cases) {
    assert.deepEqual(defaultStyleForTextRole(role), expected, role);
  }
});

test('status helpers cover every status, including destructive and completion styling', () => {
  const expectedTokens = {
    idle: 'status.pending',
    pending: 'status.pending',
    running: 'status.running',
    success: 'status.success',
    warning: 'status.warning',
    error: 'status.error',
    info: 'status.info'
  };
  const expectedMarkers = {
    idle: defaultTheme.tokens.symbols.progressEmpty,
    pending: defaultTheme.tokens.symbols.progressEmpty,
    running: defaultTheme.tokens.symbols.statusInfo,
    success: defaultTheme.tokens.symbols.statusSuccess,
    warning: defaultTheme.tokens.symbols.statusWarning,
    error: defaultTheme.tokens.symbols.statusError,
    info: defaultTheme.tokens.symbols.statusInfo
  };

  for (const [status, token] of Object.entries(expectedTokens)) {
    assert.equal(statusToken(status), token, status);
    assert.deepEqual(statusStyle(status), foreground(token, {
      bold: status === 'error' || status === 'success'
    }), status);
    assert.equal(statusMarker(status, defaultTheme), expectedMarkers[status], status);
  }
});
