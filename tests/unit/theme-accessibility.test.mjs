import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findAccessibleNode,
  toAccessibleSnapshot,
  validateAccessibleSnapshot
} from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { defaultTheme, defineTheme, mergeThemes, renderStyledText } from '../../dist/theme/index.js';
import { renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { text } from '../../dist/widgets/index.js';

test('theme API defines, merges, renders, and degrades styled text', async () => {
  const colorHost = createMemoryTerminalHost();
  const monoHost = createMemoryTerminalHost({ isTty: false });
  const colorCapabilities = await colorHost.getCapabilities();
  const monoCapabilities = await monoHost.getCapabilities();
  const theme = defineTheme({
    name: 'custom',
    symbols: { pointer: '>\u001B[31m', checked: '[x]\u001B[0m' },
    styles: {
      tones: { error: { color: 'brightRed' } },
      emphasis: { underline: { underline: true } }
    },
    spacing: { gap: 2 }
  });
  const merged = mergeThemes(theme, { styles: { tones: { success: { color: 'brightGreen', bold: true } } } });

  assert.equal(theme.name, 'custom');
  assert.equal(theme.symbols.pointer, '>');
  assert.equal(theme.symbols.checked, '[x]');
  assert.equal(theme.spacing.gap, 2);
  assert.deepEqual(merged.styles.tones.success, { color: 'brightGreen', bold: true });
  assert.equal(renderStyledText({ text: 'bad\u001B[31m', tone: 'error', emphasis: 'underline' }, theme, colorCapabilities), '\u001B[4m\u001B[91mbad\u001B[0m');
  assert.equal(renderStyledText({ text: 'plain', tone: 'success' }, theme, monoCapabilities), 'plain');
});

test('text widgets preserve StyledText data and render its plain text into frames', () => {
  const widget = text({ text: 'Styled title', tone: 'accent', emphasis: 'bold' }, { id: 'styled-title' });
  const frame = renderWidgetFrame(widget, { columns: 20, rows: 2 });

  assert.deepEqual(widget.props.content, { text: 'Styled title', tone: 'accent', emphasis: 'bold' });
  assert.equal(renderFrame(frame), 'Styled title');
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
