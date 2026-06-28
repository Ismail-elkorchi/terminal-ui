import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findAccessibleNode,
  toAccessibleSnapshot,
  validateAccessibleSnapshot
} from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { defaultThemes, defineTheme, mergeThemes, resolveTerminalStyle } from '../../dist/theme/index.js';
import { renderDiffAnsi, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { richText } from '../../dist/widgets/index.js';

test('theme API defines token palettes, merges symbols, and resolves semantic styles', async () => {
  const colorHost = createMemoryTerminalHost();
  const monoHost = createMemoryTerminalHost({ isTty: false });
  const colorCapabilities = await colorHost.getCapabilities();
  const monoCapabilities = await monoHost.getCapabilities();
  const theme = defineTheme({
    name: 'custom',
    symbols: {
      pointer: '>\u001B[31m',
      checkboxChecked: '[x]\u001B[0m',
      spinnerFrames: ['a\u001B[31m', 'b']
    },
    colors: { 'status.error': { kind: 'ansi', value: 9 } },
    spacing: { gap: 2 }
  });
  const merged = mergeThemes(theme, {
    colors: {
      'custom.surface': { kind: 'rgb', r: 1, g: 2, b: 3 },
      'status.success': { kind: 'ansi', value: 10 }
    }
  });
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v1',
    width: 4,
    height: 1,
    fullRewrite: false,
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'bad\u001B[31m', style: { fg: { kind: 'theme', token: 'status.error' }, underline: true } }]
    }]
  };

  assert.equal(theme.name, 'custom');
  assert.equal(theme.symbols.pointer, '>');
  assert.equal(theme.symbols.checkboxChecked, '[x]');
  assert.deepEqual(theme.symbols.spinnerFrames, ['a', 'b']);
  assert.equal(theme.spacing.gap, 2);
  assert.deepEqual(merged.colors['custom.surface'], { kind: 'rgb', r: 1, g: 2, b: 3 });
  assert.deepEqual(
    resolveTerminalStyle({ fg: { kind: 'theme', token: 'missing.custom' } }, theme),
    { fg: theme.colors['text.default'] }
  );
  assert.match(renderDiffAnsi(diff, { capabilities: colorCapabilities, theme }), /\u001B\[4;38;5;9mbad\u001B\[0m/u);
  assert.equal(renderDiffAnsi(diff, { capabilities: monoCapabilities, theme }), '\u001B[1;1Hbad');
  assert.equal(defaultThemes.noColor.name, 'noColor');
});

test('rich text widgets preserve render spans and render their plain text into frames', () => {
  const widget = richText({
    id: 'styled-title',
    segments: [{ text: 'Styled title', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }]
  });
  const frame = renderWidgetFrame(widget, { columns: 20, rows: 2 });

  assert.deepEqual(widget.props.segments, [{ text: 'Styled title', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }]);
  assert.equal(renderFramePlain(frame), 'Styled title');
  assert.equal(frame.accessibility.root.value, 'Styled title');
});

test('accessible snapshots validate tree identity, focus paths, and role state', () => {
  const snapshot = toAccessibleSnapshot({
    source: 'tui',
    root: {
      id: 'app',
      role: 'application',
      children: [
        { id: 'title', role: 'text', label: 'Title' },
        { id: 'field', role: 'textbox', label: 'Name', focused: true }
      ]
    }
  });

  assert.equal(validateAccessibleSnapshot(snapshot).ok, true);
  assert.equal(findAccessibleNode(snapshot, 'field')?.role, 'textbox');
  assert.deepEqual(snapshot.focusPath, ['app', 'field']);

  const duplicate = validateAccessibleSnapshot({
    ...snapshot,
    root: {
      id: 'app',
      role: 'application',
      children: [
        { id: 'item', role: 'text' },
        { id: 'item', role: 'text' }
      ]
    },
    focusPath: []
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'ACCESSIBLE_SNAPSHOT_INVALID');

  const wrongFocus = validateAccessibleSnapshot({ ...snapshot, focusPath: ['app', 'title'] });
  assert.equal(wrongFocus.ok, false);
  assert.equal(wrongFocus.error.code, 'ACCESSIBLE_SNAPSHOT_INVALID');

  const invalidProgress = validateAccessibleSnapshot({
    ...snapshot,
    root: { id: 'status', role: 'status', progress: { value: 2, max: 1 } },
    focusPath: []
  });
  assert.equal(invalidProgress.ok, false);
  assert.equal(invalidProgress.error.code, 'ACCESSIBLE_SNAPSHOT_INVALID');
});

test('accessible snapshot validation returns diagnostics for malformed public payloads', () => {
  const underShaped = validateAccessibleSnapshot({
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: 'tui',
    root: { role: 'text' },
    focusPath: [],
    diagnostics: []
  });
  const invalidDiagnostic = validateAccessibleSnapshot({
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: 'tui',
    root: { id: 'root', role: 'application' },
    focusPath: [],
    diagnostics: [
      {
        schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
        code: 'UNKNOWN_DIAGNOSTIC',
        severity: 'error',
        message: 'unknown'
      }
    ]
  });
  const invalidState = validateAccessibleSnapshot({
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: 'tui',
    root: { id: 'root', role: 'application', selected: 'yes' },
    focusPath: [],
    diagnostics: []
  });

  assert.equal(underShaped.ok, false);
  assert.match(underShaped.error.message, /id/u);
  assert.equal(invalidDiagnostic.ok, false);
  assert.match(invalidDiagnostic.error.message, /unsupported diagnostic code/u);
  assert.equal(invalidState.ok, false);
  assert.match(invalidState.error.message, /selected/u);
});

test('accessible snapshots sanitize exported text and validation rejects raw control sequences', () => {
  const snapshot = toAccessibleSnapshot({
    source: 'prompt',
    title: 'Title\u001B[31m',
    root: {
      id: 'root',
      role: 'textbox',
      label: 'Name\u001B[32m',
      value: 'Ada\u001B[33m',
      description: 'Prompt\u001B[34m',
      focused: true,
      children: [{ id: 'child', role: 'text', label: 'Child\u001B[35m' }]
    }
  });

  assert.equal(snapshot.title, 'Title');
  assert.equal(snapshot.root.label, 'Name');
  assert.equal(snapshot.root.value, 'Ada');
  assert.equal(snapshot.root.description, 'Prompt');
  assert.equal(snapshot.root.children[0]?.label, 'Child');
  assert.equal(validateAccessibleSnapshot(snapshot).ok, true);

  const raw = validateAccessibleSnapshot({
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: 'prompt',
    focusPath: [],
    diagnostics: [],
    root: {
      id: 'root',
      role: 'textbox',
      label: 'Name\u001B[32m'
    }
  });
  assert.equal(raw.ok, false);
  assert.match(raw.error.message, /control sequences/u);
});
