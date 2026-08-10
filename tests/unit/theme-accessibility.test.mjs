import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findAccessibleNode,
  toAccessibleSnapshot,
  validateAccessibleSnapshot
} from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createDiagnosticOccurrenceReporter, diagnostic } from '../../dist/diagnostics.js';
import { defaultThemes,
  defaultTheme,
  defineTheme,
  mergeThemes,
  resolveThemeColor,
  resolveTerminalStyle } from '../../dist/theme/index.js';
import { renderDiffAnsi,
  renderAccessibleSnapshot,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { richText } from '../../dist/components/index.js';

test('theme API defines token palettes, merges symbols, and resolves semantic styles', async () => {
  const colorHost = createMemoryTerminalHost({ capabilities: { colorDepth: 8 } });
  const monoHost = createMemoryTerminalHost({ isTty: false });
  const colorCapabilities = await colorHost.getCapabilities();
  const monoCapabilities = await monoHost.getCapabilities();
  const theme = defineTheme({
    name: 'custom',
    tokens: {
      symbols: {
        pointer: '>\u001B[31m',
        checkboxChecked: '[x]\u001B[0m',
        spinnerFrames: ['a\u001B[31m', 'b']
      },
      colors: { 'status.error': { kind: 'ansi', value: 9 } }
    }
  });
  const merged = mergeThemes(theme, {
    tokens: {
      colors: {
        'custom.surface': { kind: 'rgb', r: 1, g: 2, b: 3 },
        'status.success': { kind: 'ansi', value: 10 }
      }
    }
  });
  const diff = {
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
  assert.match(theme.fingerprint, /^theme:[0-9a-f]{8}$/u);
  assert.equal(theme.tokens.symbols.pointer, '>');
  assert.equal(theme.tokens.symbols.checkboxChecked, '[x]');
  assert.deepEqual(theme.tokens.symbols.spinnerFrames, ['a', 'b']);
  assert.notEqual(merged.fingerprint, theme.fingerprint);
  assert.deepEqual(merged.tokens.colors['custom.surface'], { kind: 'rgb', r: 1, g: 2, b: 3 });
  assert.deepEqual(
    resolveTerminalStyle({ fg: { kind: 'theme', token: 'missing.custom' } }, theme),
    { fg: { kind: 'rgb', r: 218, g: 225, b: 233 } }
  );
  assert.match(renderDiffAnsi(diff, { capabilities: colorCapabilities, theme }), /\u001B\[4;38;5;9mbad\u001B\[0m/u);
  assert.equal(renderDiffAnsi(diff, { capabilities: monoCapabilities, theme }), '\u001B[Hbad');
  assert.equal(defaultThemes.noColor.name, 'noColor');
  assert.deepEqual(resolveThemeColor(defaultTheme, 'app.background'), { kind: 'rgb', r: 12, g: 16, b: 22 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.background'), { kind: 'rgb', r: 17, g: 23, b: 31 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.bar.background'), { kind: 'rgb', r: 22, g: 29, b: 38 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.raised.background'), { kind: 'rgb', r: 28, g: 36, b: 47 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.inset.background'), { kind: 'rgb', r: 10, g: 14, b: 20 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.backdrop'), { kind: 'rgb', r: 7, g: 10, b: 14 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'status.success'), { kind: 'rgb', r: 118, g: 205, b: 112 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'text.default'), { kind: 'rgb', r: 218, g: 225, b: 233 });
  assert.deepEqual(resolveThemeColor(defaultThemes.minimal, 'accent.primary'), { kind: 'ansi', value: 14 });
  assert.equal(resolveThemeColor(defaultThemes.minimal, 'app.background'), undefined);
});

test('the graphical default paints a complete canvas while minimal preserves terminal colors', () => {
  const graphical = renderElementFrame(richText({
    id: 'graphical',
    segments: [{ kind: 'text', text: 'A' }]
  }), { columns: 3, rows: 2 }, { theme: defaultTheme });
  const minimal = renderElementFrame(richText({
    id: 'minimal',
    segments: [{ kind: 'text', text: 'A' }]
  }), { columns: 3, rows: 2 }, { theme: defaultThemes.minimal });

  assert.equal(graphical.cells.length, 6);
  assert.equal(minimal.cells.length, 1);
  assert.equal(graphical.cells.every((cell) => cell.style?.bg?.token === 'app.background'), true);
  assert.equal(
    graphical.cells.filter((cell) => cell.text === ' ').every((cell) => cell.style?.fg?.token === 'app.foreground'),
    true
  );
  assert.equal(graphical.cells.find((cell) => cell.text === 'A')?.style?.fg?.token, 'text.default');
});

test('theme fingerprints are stable for equivalent themes and change with theme content', () => {
  const first = defineTheme({
    name: 'ordered',
    tokens: {
      colors: {
        'custom.b': { kind: 'rgb', r: 1, g: 2, b: 3 },
        'custom.a': { kind: 'ansi', value: 4 }
      }
    }
  });
  const second = defineTheme({
    name: 'ordered',
    tokens: {
      colors: {
        'custom.a': { kind: 'ansi', value: 4 },
        'custom.b': { kind: 'rgb', r: 1, g: 2, b: 3 }
      }
    }
  });
  const changed = mergeThemes(first, { tokens: { symbols: { pointer: '*' } } });

  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(changed.fingerprint, first.fingerprint);
  for (const theme of Object.values(defaultThemes)) {
    assert.match(theme.fingerprint, /^theme:[0-9a-f]{8}$/u);
  }
});

test('rich text components preserve render spans and render their plain text into frames', () => {
  const element = richText({
    id: 'styled-title',
    segments: [{ kind: 'text', text: 'Styled title', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }]
  });
  const frame = renderElementFrame(element, { columns: 20, rows: 2 });

  assert.equal(renderFramePlain(frame), 'Styled title');
  assert.equal(frame.cells[0]?.style?.fg?.kind, 'theme');
  assert.equal(frame.cells[0]?.style?.fg?.token, 'accent.primary');
  assert.equal(frame.cells[0]?.style?.bold, true);
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
    root: {
      id: 'status',
      role: 'progressbar',
      numericValue: { current: 2, minimum: 0, maximum: 1 }
    },
    focusPath: []
  });
  assert.equal(invalidProgress.ok, false);
  assert.equal(invalidProgress.error.code, 'ACCESSIBLE_SNAPSHOT_INVALID');
});

test('accessible snapshots detach and freeze nested semantic state', () => {
  const numericValue = { current: 1, minimum: 0, maximum: 2 };
  const scope = { kind: 'modal', trapsFocus: true };
  const window = { startIndex: 0, endIndexExclusive: 1, totalCount: 2 };
  const snapshot = toAccessibleSnapshot({
    source: 'renderer',
    root: {
      id: 'progress',
      role: 'progressbar',
      numericValue,
      scope,
      window
    }
  });

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.root), true);
  assert.equal(Object.isFrozen(snapshot.root.numericValue), true);
  assert.equal(Object.isFrozen(snapshot.root.scope), true);
  assert.equal(Object.isFrozen(snapshot.root.window), true);
  numericValue.current = 2;
  scope.trapsFocus = false;
  window.totalCount = 3;
  assert.equal(snapshot.root.numericValue.current, 1);
  assert.equal(snapshot.root.scope.trapsFocus, true);
  assert.equal(snapshot.root.window.totalCount, 2);
});

test('accessible snapshots enforce role fields, direct-child roles, numeric values, and index bases', () => {
  const validRoots = [
    {
      id: 'document',
      role: 'document',
      children: [
        { id: 'heading', role: 'heading', label: 'Documentation', position: { level: 1 } },
        { id: 'link', role: 'link', label: 'Next page' },
        {
          id: 'list',
          role: 'list',
          children: [{ id: 'list-item', role: 'listitem', label: 'First item' }]
        },
        {
          id: 'tabs',
          role: 'group',
          children: [
            {
              id: 'tablist',
              role: 'tablist',
              children: [{ id: 'tab', role: 'tab', controls: 'panel', selected: true }]
            },
            { id: 'panel', role: 'tabpanel', labelledBy: 'tab' }
          ]
        }
      ]
    },
    {
      id: 'form',
      role: 'form',
      children: [{ id: 'switch', role: 'switch', checked: true }]
    },
    {
      id: 'choices',
      role: 'radiogroup',
      children: [{ id: 'choice', role: 'radio', checked: true }]
    },
    {
      id: 'files',
      role: 'tree',
      window: { startIndex: 0, endIndexExclusive: 1, totalCount: 3, omittedBefore: 0, omittedAfter: 2 },
      children: [{
        id: 'file',
        role: 'treeitem',
        position: { positionInSet: 1, setSize: 3, level: 1 },
        expanded: false,
        selected: true
      }]
    },
    {
      id: 'calendar',
      role: 'grid',
      children: [{
        id: 'calendar-body',
        role: 'rowgroup',
        children: [{
          id: 'week',
          role: 'row',
          position: { rowIndex: 1, rowCount: 1, columnCount: 3 },
          children: [
            { id: 'weekday', role: 'columnheader', position: { columnIndex: 1, columnCount: 3 } },
            { id: 'week-number', role: 'rowheader', position: { columnIndex: 2, columnCount: 3 } },
            {
              id: 'day',
              role: 'gridcell',
              position: { rowIndex: 1, columnIndex: 3, columnCount: 3 },
              selected: true
            }
          ]
        }]
      }]
    },
    {
      id: 'grouped-choices',
      role: 'listbox',
      children: [{
        id: 'preferred',
        role: 'group',
        children: [{ id: 'preferred-choice', role: 'option' }]
      }]
    },
    {
      id: 'volume',
      role: 'slider',
      numericValue: { current: 5, minimum: 0, maximum: 10 }
    },
    {
      id: 'labelled-group',
      role: 'group',
      children: [
        { id: 'name-label', role: 'text', label: 'Name' },
        { id: 'name-input', role: 'textbox', labelledBy: 'name-label' }
      ]
    },
    {
      id: 'browser',
      role: 'application',
      children: [
        {
          id: 'browser-toolbar',
          role: 'toolbar',
          children: [{ id: 'back', role: 'button', label: 'Back' }]
        },
        {
          id: 'browser-search',
          role: 'search',
          children: [{ id: 'location', role: 'combobox', label: 'Address' }]
        },
        {
          id: 'browser-library',
          role: 'complementary',
          label: 'Library',
          children: [{ id: 'history', role: 'list' }]
        }
      ]
    }
  ];

  for (const root of validRoots) {
    assert.equal(validateAccessibleSnapshot({
      source: 'renderer',
      root,
      focusPath: [],
      diagnostics: []
    }).ok, true, root.id);
  }
  assert.match(renderAccessibleSnapshot(toAccessibleSnapshot({
    source: 'renderer',
    root: validRoots[3]
  })), /position:1\/3/u);
  assert.match(renderAccessibleSnapshot(toAccessibleSnapshot({
    source: 'renderer',
    root: validRoots[4]
  })), /\[row:1\/1\]/u);

  const invalidRoots = [
    { id: 'unknown', role: 'text', invented: true },
    { id: 'checked', role: 'button', checked: true },
    { id: 'mixed-switch', role: 'switch', checked: 'mixed' },
    { id: 'selected', role: 'text', selected: true },
    { id: 'expanded', role: 'status', expanded: true },
    { id: 'readonly-button', role: 'button', readOnly: true },
    { id: 'position', role: 'option', position: { positionInSet: 0, setSize: 1 } },
    { id: 'position-range', role: 'option', position: { positionInSet: 2, setSize: 1 } },
    { id: 'level', role: 'treeitem', position: { level: 0 } },
    { id: 'row-position', role: 'row', position: { rowIndex: 0, rowCount: 1 } },
    { id: 'row-position-range', role: 'row', position: { rowIndex: 2, rowCount: 1 } },
    { id: 'column-position', role: 'gridcell', position: { columnIndex: 0, columnCount: 1 } },
    { id: 'column-position-range', role: 'gridcell', position: { columnIndex: 2, columnCount: 1 } },
    {
      id: 'window',
      role: 'listbox',
      window: { startIndex: 1, endIndexExclusive: 3, totalCount: 2 }
    },
    {
      id: 'numeric-role',
      role: 'text',
      numericValue: { current: 1, minimum: 0, maximum: 2 }
    },
    {
      id: 'numeric-range',
      role: 'spinbutton',
      numericValue: { current: Number.NaN, minimum: 0, maximum: 2 }
    },
    {
      id: 'indeterminate-meter',
      role: 'meter',
      numericValue: { indeterminate: true }
    },
    { id: 'listbox', role: 'listbox', children: [{ id: 'radio', role: 'radio' }] },
    { id: 'tree', role: 'tree', children: [{ id: 'option', role: 'option' }] },
    { id: 'grid', role: 'grid', children: [{ id: 'cell', role: 'gridcell' }] },
    { id: 'rowgroup', role: 'rowgroup', children: [{ id: 'cell', role: 'gridcell' }] },
    { id: 'missing-label-reference', role: 'textbox', labelledBy: 'missing-label' },
    { id: 'self-label-reference', role: 'textbox', labelledBy: 'self-label-reference' },
    { id: 'missing-control-reference', role: 'tab', controls: 'missing-panel' },
    {
      id: 'wrong-control-role',
      role: 'group',
      children: [
        { id: 'wrong-tab', role: 'tab', controls: 'not-a-panel' },
        { id: 'not-a-panel', role: 'group' }
      ]
    },
    {
      id: 'wrong-tabpanel-label',
      role: 'group',
      children: [
        { id: 'plain-label', role: 'text' },
        { id: 'wrong-panel', role: 'tabpanel', labelledBy: 'plain-label' }
      ]
    }
  ];

  for (const root of invalidRoots) {
    const result = validateAccessibleSnapshot({
      source: 'renderer',
      root,
      focusPath: [],
      diagnostics: []
    });
    assert.equal(result.ok, false, root.id);
  }
});

test('accessible snapshot validation returns diagnostics for malformed public payloads', () => {
  const underShaped = validateAccessibleSnapshot({
    source: 'tui',
    root: { role: 'text' },
    focusPath: [],
    diagnostics: []
  });
  const invalidDiagnostic = validateAccessibleSnapshot({
    source: 'tui',
    root: { id: 'root', role: 'application' },
    focusPath: [],
    diagnostics: [
      {
        fingerprint: 'diagnostic:unknown',
        code: 'UNKNOWN_DIAGNOSTIC',
        severity: 'error',
        message: 'unknown'
      }
    ]
  });
  const invalidState = validateAccessibleSnapshot({
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

test('accessible snapshots accept diagnostic content, not occurrence metadata', () => {
  const occurrence = createDiagnosticOccurrenceReporter('accessibility-test')
    .report(diagnostic('INPUT_TIMEOUT', 'Timed out.'));
  const snapshot = {
    source: 'tui',
    root: { id: 'root', role: 'application' },
    focusPath: []
  };

  assert.equal(validateAccessibleSnapshot({
    ...snapshot,
    diagnostics: [occurrence.diagnostic]
  }).ok, true);
  const invalid = validateAccessibleSnapshot({
    ...snapshot,
    diagnostics: [occurrence]
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error.message, /unsupported field: id/u);
});

test('accessible snapshot validation rejects unknown fields throughout its object graph', () => {
  const roots = [
    { id: 'root', role: 'application', extra: true },
    {
      id: 'root',
      role: 'progressbar',
      numericValue: { current: 1, minimum: 0, maximum: 2, extra: true }
    },
    {
      id: 'root',
      role: 'application',
      scope: { kind: 'document', extra: true }
    },
    {
      id: 'root',
      role: 'list',
      window: { startIndex: 0, endIndexExclusive: 0, totalCount: 0, extra: true }
    },
    {
      id: 'root',
      role: 'option',
      position: { positionInSet: 1, setSize: 1, extra: true }
    }
  ];

  for (const root of roots) {
    const result = validateAccessibleSnapshot({
      source: 'renderer',
      root,
      focusPath: [],
      diagnostics: []
    });
    assert.equal(result.ok, false, root.id);
    assert.match(result.error.message, /unsupported/u);
  }
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
