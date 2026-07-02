import assert from 'node:assert/strict';
import test from 'node:test';

import { noColorTheme } from '../../dist/theme/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { divider } from '../../dist/widgets/index.js';

test('divider renders labelled horizontal separators with semantic source roles', () => {
  const frame = renderWidgetFrame(divider({
    id: 'section-divider',
    line: 'dashed',
    label: 'Operations',
    labelAlign: 'center'
  }), { columns: 24, rows: 1 });
  const separatorCells = frame.cells.filter((cell) => cell.source?.role === 'separator');

  assert.equal(renderFramePlain(frame), '┄┄┄┄┄┄ Operations ┄┄┄┄┄┄');
  assert.equal(separatorCells.length > 0, true);
  assert.equal(separatorCells.every((cell) => cell.source?.kind === 'divider'), true);
  assert.deepEqual(separatorCells[0]?.style?.fg, { kind: 'theme', token: 'surface.border' });
  assert.equal(frame.accessibility.root.label, 'Operations');
});

test('divider renders vertical and empty separators without layout state', () => {
  const vertical = renderWidgetFrame(divider({
    id: 'vertical-divider',
    orientation: 'vertical',
    line: 'dotted'
  }), { columns: 3, rows: 3 });
  const empty = renderWidgetFrame(divider({
    id: 'empty-divider',
    line: 'empty'
  }), { columns: 5, rows: 1 });

  assert.equal(renderFramePlain(vertical), '┊\n┊\n┊');
  assert.equal(renderFramePlain(empty), '');
  assert.equal(empty.cells.every((cell) => cell.source?.role === 'separator'), true);
});

test('divider uses theme separator glyphs for single-line no-color output', () => {
  const horizontal = renderWidgetFrame(divider({
    id: 'no-color-horizontal',
    label: 'Section',
    labelAlign: 'center'
  }), { columns: 16, rows: 1 }, { theme: noColorTheme });
  const vertical = renderWidgetFrame(divider({
    id: 'no-color-vertical',
    orientation: 'vertical'
  }), { columns: 1, rows: 3 }, { theme: noColorTheme });

  assert.equal(renderFramePlain(horizontal), '--- Section ----');
  assert.equal(renderFramePlain(vertical), '|\n|\n|');
});
