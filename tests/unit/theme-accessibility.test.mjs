import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findAccessibleNode,
  createAccessibleSnapshot,
  decodeAccessibleSnapshot
} from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createDiagnosticOccurrenceReporter, diagnostic } from '../../dist/diagnostics.js';
import { asciiSymbols,
  builtInThemes,
  coreColorTokens,
  defaultTheme,
  defineTheme,
  isTerminalTheme,
  isThemeColorToken,
  mergeThemes,
  resolveThemeColor,
  resolveTerminalStyle,
  themeColor,
  unicodeSymbols } from '../../dist/theme/index.js';
import { sameThemeRendering } from '../../dist/theme/theme.js';
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
  assert.equal(theme.tokens.symbols.pointer, '>');
  assert.equal(theme.tokens.symbols.checkboxChecked, '[x]');
  assert.deepEqual(theme.tokens.symbols.spinnerFrames, ['a', 'b']);
  assert.deepEqual(merged.tokens.colors['custom.surface'], { kind: 'rgb', r: 1, g: 2, b: 3 });
  assert.equal(resolveTerminalStyle({ fg: { kind: 'theme', token: 'missing.custom' } }, theme), undefined);
  assert.match(renderDiffAnsi(diff, { capabilities: colorCapabilities, theme }), /\u001B\[4;38;5;9mbad\u001B\[0m/u);
  assert.equal(renderDiffAnsi(diff, { capabilities: monoCapabilities, theme }), '\u001B[Hbad');
  assert.equal(builtInThemes.noColor.name, 'noColor');
  assert.deepEqual(resolveThemeColor(defaultTheme, 'app.background'), { kind: 'rgb', r: 12, g: 16, b: 22 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.background'), { kind: 'rgb', r: 17, g: 23, b: 31 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.bar.background'), { kind: 'rgb', r: 22, g: 29, b: 38 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.raised.background'), { kind: 'rgb', r: 28, g: 36, b: 47 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.inset.background'), { kind: 'rgb', r: 10, g: 14, b: 20 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'surface.backdrop'), { kind: 'rgb', r: 7, g: 10, b: 14 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'status.success'), { kind: 'rgb', r: 118, g: 205, b: 112 });
  assert.deepEqual(resolveThemeColor(defaultTheme, 'text.default'), { kind: 'rgb', r: 218, g: 225, b: 233 });
  assert.deepEqual(resolveThemeColor(builtInThemes.minimal, 'accent.primary'), { kind: 'ansi', value: 14 });
  assert.equal(resolveThemeColor(builtInThemes.minimal, 'app.background'), undefined);
});

test('the graphical default retains an implicit canvas while minimal preserves terminal colors', () => {
  const graphical = renderElementFrame(richText({
    id: 'graphical',
    segments: [{ kind: 'text', text: 'A' }]
  }), { columns: 3, rows: 2 }, { theme: defaultTheme });
  const minimal = renderElementFrame(richText({
    id: 'minimal',
    segments: [{ kind: 'text', text: 'A' }]
  }), { columns: 3, rows: 2 }, { theme: builtInThemes.minimal });

  assert.equal(graphical.cells.length, 1);
  assert.equal(minimal.cells.length, 1);
  assert.equal(graphical.canvasStyle?.bg?.token, 'app.background');
  assert.equal(graphical.canvasStyle?.fg?.token, 'app.foreground');
  assert.equal(minimal.canvasStyle, undefined);
  assert.equal(graphical.cells.every((cell) => cell.style?.bg?.token === 'app.background'), true);
  assert.equal(graphical.cells.find((cell) => cell.text === 'A')?.style?.fg?.token, 'text.default');
});

test('theme rendering identity is exact, order independent, and excludes names', () => {
  const first = defineTheme({
    name: 'ordered-copy',
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

  const collisionLeft = defineTheme({ tokens: { colors: { 'custom.x': { kind: 'rgb', r: 45, g: 88, b: 140 } } } });
  const collisionRight = defineTheme({ tokens: { colors: { 'custom.x': { kind: 'rgb', r: 190, g: 250, b: 218 } } } });

  assert.equal(sameThemeRendering(first, second), true);
  assert.equal(sameThemeRendering(changed, first), false);
  assert.equal(sameThemeRendering(collisionLeft, collisionRight), false);
});

test('themes own immutable token data and only classify canonical themes', () => {
  const color = { kind: 'rgb', r: 1, g: 2, b: 3 };
  const symbols = { pointer: '>' };
  const theme = defineTheme({
    name: 'owned-theme',
    tokens: { colors: { 'custom.owned': color }, symbols }
  });
  color.r = 200;
  symbols.pointer = '!';

  assert.equal(theme.tokens.colors['custom.owned']?.r, 1);
  assert.equal(theme.tokens.symbols.pointer, '>');
  assert.equal(Object.isFrozen(theme), true);
  assert.equal(Object.isFrozen(theme.tokens), true);
  assert.equal(Object.isFrozen(theme.tokens.colors['custom.owned']), true);
  assert.equal(Object.isFrozen(theme.tokens.symbols), true);
  assert.equal(Object.isFrozen(theme.tokens.symbols.borderSingle), true);
  assert.equal(Object.isFrozen(theme.tokens.symbols.spinnerFrames), true);
  assert.equal(isTerminalTheme(theme), true);
  assert.equal(isTerminalTheme({ name: 'fake', tokens: {} }), false);
});

test('theme catalogs are immutable and symbol mode selects a complete repertoire', () => {
  const ascii = defineTheme({ tokens: { symbols: { mode: 'ascii' } } });
  const unicode = defineTheme({ tokens: { symbols: { mode: 'unicode' } } }, builtInThemes.minimal);

  assert.equal(ascii.tokens.symbols.checkboxChecked, asciiSymbols.checkboxChecked);
  assert.equal(ascii.tokens.symbols.borderSingle.topLeft, asciiSymbols.borderSingle.topLeft);
  assert.equal(unicode.tokens.symbols.checkboxChecked, unicodeSymbols.checkboxChecked);
  assert.equal(unicode.tokens.symbols.borderSingle.topLeft, unicodeSymbols.borderSingle.topLeft);
  assert.equal(Object.isFrozen(coreColorTokens), true);
  assert.equal(Object.isFrozen(asciiSymbols), true);
  assert.equal(Object.isFrozen(asciiSymbols.borderSingle), true);
  assert.equal(Object.isFrozen(asciiSymbols.spinnerFrames), true);
  assert.equal(Object.isFrozen(builtInThemes), true);
  assert.equal(isThemeColorToken('accent.primary'), true);
  assert.equal(isThemeColorToken('custom.product'), true);
  assert.equal(isThemeColorToken(42), false);
  assert.deepEqual(themeColor('accent.primary'), { kind: 'theme', token: 'accent.primary' });
  assert.equal(Object.isFrozen(themeColor('accent.primary')), true);
  assert.throws(() => themeColor('accent'), /core token/u);
});

test('undefined color overrides are rejected instead of deleting base tokens', () => {
  assert.throws(() => defineTheme({
    tokens: { colors: { 'text.default': undefined } }
  }), /Theme color text\.default must be an object/u);
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
  const snapshot = createAccessibleSnapshot({
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

  assert.equal(decodeAccessibleSnapshot(snapshot).ok, true);
  assert.equal(findAccessibleNode(snapshot, 'field')?.role, 'textbox');
  assert.deepEqual(snapshot.focusPath, ['app', 'field']);

  const duplicate = decodeAccessibleSnapshot({
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

  const wrongFocus = decodeAccessibleSnapshot({ ...snapshot, focusPath: ['app', 'title'] });
  assert.equal(wrongFocus.ok, false);
  assert.equal(wrongFocus.error.code, 'ACCESSIBLE_SNAPSHOT_INVALID');

  const invalidProgress = decodeAccessibleSnapshot({
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
  const snapshot = createAccessibleSnapshot({
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

test('accessible snapshot validation returns the retained owned value', () => {
  const numericValue = { current: 1, minimum: 0, maximum: 2 };
  const child = { id: 'status', role: 'progressbar', numericValue };
  const children = [child];
  const input = {
    source: 'renderer',
    root: { id: 'root', role: 'application', children },
    focusPath: [],
    diagnostics: []
  };

  const result = decodeAccessibleSnapshot(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  assert.notEqual(result.value, input);
  assert.notEqual(result.value.root, input.root);
  assert.notEqual(result.value.root.children, children);
  assert.notEqual(result.value.root.children[0].numericValue, numericValue);
  numericValue.current = 2;
  child.role = 'text';
  children.length = 0;
  assert.equal(result.value.root.children[0].role, 'progressbar');
  assert.equal(result.value.root.children[0].numericValue.current, 1);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.root.children), true);
  assert.strictEqual(decodeAccessibleSnapshot(result.value).value, result.value);
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
        { id: 'name-help', role: 'text', label: 'Use your full name' },
        {
          id: 'name-input',
          role: 'textbox',
          labelledBy: 'name-label',
          describedBy: ['name-help']
        }
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
    assert.equal(decodeAccessibleSnapshot({
      source: 'renderer',
      root,
      focusPath: [],
      diagnostics: []
    }).ok, true, root.id);
  }
  assert.match(renderAccessibleSnapshot(createAccessibleSnapshot({
    source: 'renderer',
    root: validRoots[3]
  })), /position:1\/3/u);
  assert.match(renderAccessibleSnapshot(createAccessibleSnapshot({
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
    { id: 'missing-description-reference', role: 'textbox', describedBy: ['missing-description'] },
    { id: 'self-description-reference', role: 'textbox', describedBy: ['self-description-reference'] },
    {
      id: 'cyclic-description-reference',
      role: 'group',
      children: [
        { id: 'description-a', role: 'text', describedBy: ['description-b'] },
        { id: 'description-b', role: 'text', describedBy: ['description-a'] }
      ]
    },
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
    const result = decodeAccessibleSnapshot({
      source: 'renderer',
      root,
      focusPath: [],
      diagnostics: []
    });
    assert.equal(result.ok, false, root.id);
  }
});

test('accessible snapshot validation returns diagnostics for malformed public payloads', () => {
  const underShaped = decodeAccessibleSnapshot({
    source: 'tui',
    root: { role: 'text' },
    focusPath: [],
    diagnostics: []
  });
  const invalidDiagnostic = decodeAccessibleSnapshot({
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
  const invalidState = decodeAccessibleSnapshot({
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

  assert.equal(decodeAccessibleSnapshot({
    ...snapshot,
    diagnostics: [occurrence.diagnostic]
  }).ok, true);
  const invalid = decodeAccessibleSnapshot({
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
    const result = decodeAccessibleSnapshot({
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
  const snapshot = createAccessibleSnapshot({
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
  assert.equal(decodeAccessibleSnapshot(snapshot).ok, true);

  const raw = decodeAccessibleSnapshot({
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
