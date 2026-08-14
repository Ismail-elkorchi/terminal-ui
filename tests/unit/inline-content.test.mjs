import assert from 'node:assert/strict';
import test from 'node:test';
import { ignoreMessage } from '../../dist/component/index.js';

import {
  button,
  menu,
  richText,
  statusBar,
  dataGrid,
  tableColumn,
  tabs,
  text
} from '../../dist/components/index.js';
import {
  renderElementFrame,
  renderFramePlain
} from '../../dist/renderer/index.js';
import {
  defaultTheme,
  noColorTheme
} from '../../dist/theme/index.js';
import {
  inlineContentAccessibleText,
  normalizeInlineContent,
  normalizeTerminalLink
} from '../../dist/visual/index.js';

const symbol = {
  kind: 'symbol',
  unicode: '◆',
  ascii: '*',
  accessibleText: 'status'
};

test('inline content normalization sanitizes caller-supplied data and validates symbolic fallbacks', () => {
  const style = { fg: { kind: 'rgb', r: 1, g: 2, b: 3 } };
  const normalized = normalizeInlineContent([
    {
      kind: 'text',
      text: 'safe\u001b[31m',
      style,
      link: { href: 'https://example.test/\u001b', id: 'docs\u0000' }
    },
    symbol
  ]);

  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized[0]), true);
  assert.equal(normalizeInlineContent(normalized), normalized);
  assert.equal(normalized[0]?.text, 'safe');
  assert.deepEqual(normalized[0]?.link, {
    href: 'https://example.test/',
    id: 'docs'
  });
  assert.equal(normalizeTerminalLink(normalized[0].link), normalized[0].link);
  style.fg.r = 99;
  assert.deepEqual(normalized[0]?.style?.fg, { kind: 'rgb', r: 1, g: 2, b: 3 });
  assert.equal(inlineContentAccessibleText(normalized), 'safestatus');
  assert.throws(() => normalizeInlineContent(null), /must be an array/u);
  assert.throws(() => normalizeInlineContent([null]), /must be an object/u);
  assert.throws(() => normalizeInlineContent([{ kind: 'other' }]), /kind is invalid/u);
  assert.throws(() => normalizeInlineContent([{ kind: 'text' }]), /requires text/u);
  assert.throws(() => normalizeInlineContent([{
    kind: 'symbol',
    unicode: '→',
    ascii: '→',
    accessibleText: 'next'
  }]), /printable ASCII/u);
  assert.throws(() => normalizeInlineContent([{
    kind: 'symbol',
    unicode: '→',
    ascii: '->',
    accessibleText: '   '
  }]), /non-empty accessibleText/u);
  assert.throws(() => normalizeInlineContent([{
    kind: 'symbol',
    unicode: '',
    ascii: '*',
    accessibleText: 'empty'
  }]), /at least one cell/u);
  assert.throws(() => normalizeInlineContent([{
    kind: 'text',
    text: 'link',
    link: { href: 'https://example.test/', id: 'bad id' }
  }]), /ASCII identifier characters/u);
  assert.throws(() => normalizeInlineContent([{
    kind: 'text',
    text: 'link',
    link: { href: 'https://example.test/', extra: true }
  }]), /unsupported field/u);
});

test('inline content adoption reads each consumed segment field once', () => {
  const reads = new Map();
  const segment = {};
  for (const [field, value] of [
    ['kind', 'symbol'],
    ['unicode', '→'],
    ['ascii', '->'],
    ['accessibleText', 'next'],
    ['style', undefined],
    ['link', undefined]
  ]) {
    Object.defineProperty(segment, field, {
      enumerable: true,
      get() {
        reads.set(field, (reads.get(field) ?? 0) + 1);
        return value;
      }
    });
  }

  const normalized = normalizeInlineContent([segment]);

  assert.deepEqual(normalized, [{
    kind: 'symbol',
    unicode: '→',
    ascii: '->',
    accessibleText: 'next'
  }]);
  assert.deepEqual(Object.fromEntries(reads), {
    kind: 1,
    unicode: 1,
    ascii: 1,
    accessibleText: 1,
    style: 1,
    link: 1
  });
});

test('rich text projects symbol mode and accessible text while the renderer produces source metadata', () => {
  const element = richText({
    id: 'inline',
    segments: [
      { kind: 'text', text: 'Go ' },
      { kind: 'symbol', unicode: '→', ascii: '->', accessibleText: 'next' }
    ]
  });
  const unicode = renderElementFrame(element, { columns: 12, rows: 1 }, { theme: defaultTheme });
  const ascii = renderElementFrame(element, { columns: 12, rows: 1 }, { theme: noColorTheme });

  assert.equal(renderFramePlain(unicode).trimEnd(), 'Go →');
  assert.equal(renderFramePlain(ascii).trimEnd(), 'Go ->');
  assert.equal(unicode.accessibility.root.value, 'Go next');
  assert.deepEqual(
    unicode.cells.find((cell) => cell.text === '→')?.source,
    {
      elementId: 'inline',
      elementKind: 'terminal-ui/components/rich-text',
      rendererFamily: 'component',
      cellRole: 'text',
      partName: 'segment',
      itemIndex: 1,
      description: 'segment.1'
    }
  );
});

test('inline adornments use component part styles and source anatomy', () => {
  const leadingStyle = { fg: { kind: 'theme', token: 'status.info' } };
  const trailingStyle = { fg: { kind: 'theme', token: 'status.warning' } };
  const frames = [
    renderElementFrame(button({
      id: 'save',
      label: 'Save',
      onAction: () => ignoreMessage(),
      leading: [symbol],
      trailing: [{ kind: 'text', text: 'S' }],
      meta: {
        focus: { disabled: true },
        styles: { parts: { leading: leadingStyle, trailing: trailingStyle } }
      }
    }), { columns: 20, rows: 1 }),
    renderElementFrame(menu({
      id: 'actions',
      presentation: {
        activePath: ['open'],
        items: [{ kind: 'action', id: 'open', label: 'Open', leading: [symbol], trailing: [{ kind: 'text', text: 'O' }] }]
      },
      onTransition: (action) => action,
      meta: {
        focus: { disabled: true },
        styles: { parts: { leading: leadingStyle, trailing: trailingStyle } }
      }
    }), { columns: 24, rows: 1 }),
    renderElementFrame(tabs({
      id: 'views',
      presentation: { activeId: 'main', selectedId: 'main' },
      tabs: [{ id: 'main', label: 'Main', leading: [symbol], panel: text({ content: 'Panel' }) }],
      onTransition: (action) => action,
      meta: {
        focus: { disabled: true },
        styles: { parts: { leading: leadingStyle } }
      }
    }), { columns: 24, rows: 2 }),
    renderElementFrame(statusBar({
      id: 'status',
      leading: [{
        id: 'branch',
        kind: 'text',
        text: 'main',
        leading: [symbol],
        trailing: [{ kind: 'text', text: 'M' }]
      }],
      meta: { styles: { parts: { leading: leadingStyle, trailing: trailingStyle } } }
    }), { columns: 24, rows: 1 })
  ];

  for (const frame of frames) {
    const leading = frame.cells.find((cell) => cell.source?.partType === 'leading' && cell.text === '◆');
    assert.equal(leading?.style?.fg?.token, 'status.info');
    assert.equal(leading?.source?.cellRole, 'text');
  }
  assert.equal(frames[0]?.cells.find((cell) => cell.source?.partType === 'trailing')?.style?.fg?.token, 'status.warning');
  assert.equal(frames[1]?.cells.find((cell) => cell.source?.partType === 'trailing')?.style?.fg?.token, 'status.warning');
  assert.equal(frames[3]?.cells.find((cell) => cell.source?.partType === 'trailing')?.style?.fg?.token, 'status.warning');
});

test('dataGrid inline cell content preserves caller style while replacing injected source metadata', () => {
  const frame = renderElementFrame(dataGrid({
    id: 'results',
    rows: [{ id: 'one', state: 'ready' }],
    getRowId: (row) => row.id,
    presentation: { interaction: { kind: 'row',
    selectionMode: 'single', selectedRowIds: [] } },
    onTransition: (action) => action,
    columns: [tableColumn({
      id: 'state',
      header: 'State',
      value: (row) => row.state,
      render: ({ value }) => ({
        kind: 'text',
        text: String(value),
        style: { fg: { kind: 'theme', token: 'status.success' } },
        source: { elementId: 'injected' }
      })
    })]
  }), { columns: 20, rows: 2 });
  const cell = frame.cells.find((candidate) => candidate.text === 'r');

  assert.equal(cell?.style?.fg?.token, 'status.success');
  assert.equal(cell?.source?.elementId, 'results');
  assert.equal(cell?.source?.elementKind, 'terminal-ui/components/data-grid');
  assert.equal(cell?.source?.partName, 'row.one.cell.0');
});
