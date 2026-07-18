import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sameFrameCell,
  sameFrameCellSource,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from '../../dist/renderer/index.js';
import type { FrameCell } from '../../dist/renderer/index.js';

void test('terminal color equality compares structured color fields', () => {
  assert.equal(sameTerminalColor(undefined, undefined), true);
  assert.equal(sameTerminalColor({ kind: 'ansi', value: 2 }, { kind: 'ansi', value: 2 }), true);
  assert.equal(sameTerminalColor({ kind: 'ansi', value: 2 }, { kind: 'ansi', value: 3 }), false);
  assert.equal(sameTerminalColor({ kind: 'rgb', r: 1, g: 2, b: 3 }, { kind: 'rgb', r: 1, g: 2, b: 3 }), true);
  assert.equal(sameTerminalColor({ kind: 'theme', token: 'text.default' }, { kind: 'theme', token: 'text.default' }), true);
  assert.equal(sameTerminalColor({ kind: 'theme', token: 'text.default' }, { kind: 'theme', token: 'text.muted' }), false);
});

void test('terminal style equality ignores object key order and normalizes false flags', () => {
  assert.equal(
    sameTerminalStyle(
      { fg: { kind: 'theme', token: 'accent.primary' }, bold: true, italic: false },
      { bold: true, fg: { kind: 'theme', token: 'accent.primary' } }
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

void test('terminal link and source equality compare explicit fields', () => {
  assert.equal(sameTerminalLink({ href: 'https://example.test', id: 'a' }, { href: 'https://example.test', id: 'a' }), true);
  assert.equal(sameTerminalLink({ href: 'https://example.test' }, { href: 'https://example.test', id: 'a' }), false);
  assert.equal(
    sameFrameCellSource(
      { ownerId: 'x', ownerKind: 'text', family: 'text', role: 'text', part: 'title', label: 'Title' },
      { label: 'Title', part: 'title', role: 'text', family: 'text', ownerKind: 'text', ownerId: 'x' }
    ),
    true
  );
  assert.equal(sameFrameCellSource({ ownerId: 'x' }, { ownerId: 'y' }), false);
  assert.equal(sameFrameCellSource({ ownerId: 'x', itemId: 'a' }, { ownerId: 'x', itemId: 'b' }), false);
});

void test('frame cell equality covers text, width, continuation, style, link, and source', () => {
  const cell: FrameCell = {
    row: 1,
    column: 2,
    text: '界',
    width: 2,
    style: { bold: true, fg: { kind: 'rgb', r: 1, g: 2, b: 3 } },
    link: { href: 'https://example.test' },
    source: { ownerId: 'cell', role: 'text' }
  };

  assert.equal(sameFrameCell(cell, { ...cell, style: { fg: { kind: 'rgb', r: 1, g: 2, b: 3 }, bold: true } }), true);
  assert.equal(sameFrameCell(cell, { ...cell, text: '界!' }), false);
  assert.equal(sameFrameCell(cell, { ...cell, width: 1 }), false);
  assert.equal(sameFrameCell(cell, { ...cell, continuation: true }), false);
  assert.equal(sameFrameCell(undefined, undefined), true);
});
