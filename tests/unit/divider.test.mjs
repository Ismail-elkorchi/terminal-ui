import assert from 'node:assert/strict';
import test from 'node:test';

import {
  noColorTheme } from '../../dist/theme/index.js';
import { renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { divider } from '../../dist/components/index.js';

test('divider renders labelled horizontal separators with semantic source roles', () => {
  const frame = renderElementFrame(divider({
    id: 'section-divider',
    line: 'dashed',
    label: 'Operations',
    labelAlign: 'center',
    meta: {
        styles: {
            parts: { label: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }
        }
    }
}), { columns: 24, rows: 1 });
  const separatorCells = frame.cells.filter((cell) => cell.source?.cellRole === 'separator');
  const labelCells = frame.cells.filter((cell) => cell.source?.elementKind === 'terminal-ui/components/divider' && cell.source.partName === 'label');

  assert.equal(renderFramePlain(frame), '┄┄┄┄┄┄ Operations ┄┄┄┄┄┄');
  assert.equal(separatorCells.length > 0, true);
  assert.equal(separatorCells.every((cell) => cell.source?.elementKind === 'terminal-ui/components/divider'), true);
  assert.equal(separatorCells.some((cell) => cell.source?.partName === 'separator.before'), true);
  assert.equal(separatorCells.some((cell) => cell.source?.partName === 'separator.after'), true);
  assert.equal(labelCells.map((cell) => cell.text).join(''), ' Operations ');
  assert.deepEqual(separatorCells[0]?.style?.fg, { kind: 'theme', token: 'surface.border' });
  assert.deepEqual(labelCells[1]?.style?.fg, { kind: 'theme', token: 'accent.primary' });
  assert.equal(labelCells[1]?.style?.bold, true);
  assert.equal(frame.accessibility.root.label, 'Operations');
});

test('divider renders vertical and empty separators without layout state', () => {
  const vertical = renderElementFrame(divider({
    id: 'vertical-divider',
    orientation: 'vertical',
    line: 'dotted'
  }), { columns: 3, rows: 3 });
  const empty = renderElementFrame(divider({
    id: 'empty-divider',
    line: 'empty'
  }), { columns: 5, rows: 1 });

  assert.equal(renderFramePlain(vertical), '┊\n┊\n┊');
  assert.equal(renderFramePlain(empty), '');
  assert.equal(empty.cells.every((cell) => cell.source?.cellRole === 'separator'), true);
});

test('divider uses theme separator glyphs for single-line no-color output', () => {
  const horizontal = renderElementFrame(divider({
    id: 'no-color-horizontal',
    label: 'Section',
    labelAlign: 'center'
  }), { columns: 16, rows: 1 }, { theme: noColorTheme });
  const vertical = renderElementFrame(divider({
    id: 'no-color-vertical',
    orientation: 'vertical'
  }), { columns: 1, rows: 3 }, { theme: noColorTheme });

  assert.equal(renderFramePlain(horizontal), '--- Section ----');
  assert.equal(renderFramePlain(vertical), '|\n|\n|');
});
