import assert from 'node:assert/strict';
import test from 'node:test';

import {
  button,
  menu,
  richText,
  statusBar,
  table,
  tableColumn,
  tabs,
  text
} from '../../dist/components/index.js';
import {
  renderElementFrame,
  renderFramePlain
} from '../../dist/renderer/index.js';
import {
  modernTheme,
  noColorTheme
} from '../../dist/theme/index.js';
import {
  inlineContentAccessibleText,
  normalizeInlineContent
} from '../../dist/visual/index.js';

const symbol = {
  kind: 'symbol',
  unicode: '◆',
  ascii: '*',
  accessibleText: 'status'
};

test('inline content normalization sanitizes caller-supplied data and validates symbolic fallbacks', () => {
  const normalized = normalizeInlineContent([
    {
      kind: 'text',
      text: 'safe\u001b[31m',
      link: { href: 'https://example.test/\u001b', id: 'docs\u0000' }
    },
    symbol
  ]);

  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized[0]), true);
  assert.equal(normalized[0]?.text, 'safe');
  assert.deepEqual(normalized[0]?.link, {
    href: 'https://example.test/',
    id: 'docs'
  });
  assert.equal(inlineContentAccessibleText(normalized), 'safestatus');
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
});

test('rich text projects symbol mode and accessible text while the renderer produces source metadata', () => {
  const element = richText({
    id: 'inline',
    segments: [
      { kind: 'text', text: 'Go ' },
      { kind: 'symbol', unicode: '→', ascii: '->', accessibleText: 'next' }
    ]
  });
  const unicode = renderElementFrame(element, { columns: 12, rows: 1 }, { theme: modernTheme });
  const ascii = renderElementFrame(element, { columns: 12, rows: 1 }, { theme: noColorTheme });

  assert.equal(renderFramePlain(unicode).trimEnd(), 'Go →');
  assert.equal(renderFramePlain(ascii).trimEnd(), 'Go ->');
  assert.equal(unicode.accessibility.root.value, 'Go next');
  assert.deepEqual(
    unicode.cells.find((cell) => cell.text === '→')?.source,
    {
      elementId: 'inline',
      elementKind: 'richText',
      rendererFamily: 'text',
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
      meta: {
        focus: { disabled: true },
        styles: { parts: { leading: leadingStyle, trailing: trailingStyle } }
      }
    }), { columns: 24, rows: 1 }),
    renderElementFrame(tabs({
      id: 'views',
      selected: 'main',
      tabs: [{ id: 'main', label: 'Main', leading: [symbol], panel: text('Panel') }],
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

test('table inline cell content preserves caller style while replacing injected source metadata', () => {
  const frame = renderElementFrame(table({
    id: 'results',
    rows: [{ id: 'one', state: 'ready' }],
    getRowId: (row) => row.id,
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
  assert.equal(cell?.source?.elementKind, 'table');
  assert.equal(cell?.source?.partName, 'row.one.cell.0');
});
