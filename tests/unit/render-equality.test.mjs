import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sameFrameCell,
  sameFrameCellSource,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from '../../dist/tui/index.js';

test('terminal color equality compares structured color fields', () => {
  assert.equal(sameTerminalColor(undefined, undefined), true);
  assert.equal(sameTerminalColor({ kind: 'ansi', value: 2 }, { kind: 'ansi', value: 2 }), true);
  assert.equal(sameTerminalColor({ kind: 'ansi', value: 2 }, { kind: 'ansi', value: 3 }), false);
  assert.equal(sameTerminalColor({ kind: 'rgb', r: 1, g: 2, b: 3 }, { kind: 'rgb', r: 1, g: 2, b: 3 }), true);
  assert.equal(sameTerminalColor({ kind: 'theme', token: 'text.primary' }, { kind: 'theme', token: 'text.primary' }), true);
  assert.equal(sameTerminalColor({ kind: 'theme', token: 'text.primary' }, { kind: 'theme', token: 'text.muted' }), false);
});

test('terminal style equality ignores object key order and normalizes false flags', () => {
  assert.equal(
    sameTerminalStyle(
      { fg: { kind: 'theme', token: 'accent.primary' }, bold: true, italic: false },
      { italic: undefined, bold: true, fg: { kind: 'theme', token: 'accent.primary' } }
    ),
    true
  );
  assert.equal(
    sameTerminalStyle(
      { fg: { kind: 'theme', token: 'accent.primary' }, bold: true },
      { fg: { kind: 'theme', token: 'accent.primary' }, bold: false }
    ),
    false
  );
  assert.equal(sameTerminalStyle(undefined, { bold: false }), false);
});

test('terminal link and source equality compare explicit fields', () => {
  assert.equal(sameTerminalLink({ href: 'https://example.test', id: 'a' }, { href: 'https://example.test', id: 'a' }), true);
  assert.equal(sameTerminalLink({ href: 'https://example.test' }, { href: 'https://example.test', id: 'a' }), false);
  assert.equal(
    sameFrameCellSource(
      { id: 'x', kind: 'text', role: 'label', label: 'Title' },
      { label: 'Title', role: 'label', kind: 'text', id: 'x' }
    ),
    true
  );
  assert.equal(sameFrameCellSource({ id: 'x' }, { id: 'y' }), false);
});

test('frame cell equality covers text, width, continuation, style, link, and source', () => {
  const cell = {
    row: 1,
    column: 2,
    text: '界',
    width: 2,
    style: { bold: true, fg: { kind: 'rgb', r: 1, g: 2, b: 3 } },
    link: { href: 'https://example.test' },
    source: { id: 'cell', role: 'gridcell' }
  };

  assert.equal(sameFrameCell(cell, { ...cell, style: { fg: { kind: 'rgb', r: 1, g: 2, b: 3 }, bold: true } }), true);
  assert.equal(sameFrameCell(cell, { ...cell, text: '界!' }), false);
  assert.equal(sameFrameCell(cell, { ...cell, width: 1 }), false);
  assert.equal(sameFrameCell(cell, { ...cell, continuation: true }), false);
  assert.equal(sameFrameCell(undefined, undefined), true);
});
