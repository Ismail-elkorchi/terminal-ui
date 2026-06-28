import assert from 'node:assert/strict';
import test from 'node:test';

import { renderWidgetFrame } from '../../dist/tui/index.js';
import {
  button,
  menuBar,
  modal,
  palette,
  scrollback,
  table,
  text,
  textInput,
  tree
} from '../../dist/widgets/index.js';

function styleFor(frame, textValue) {
  return frame.cells.find((cell) => cell.text === textValue)?.style;
}

function styleForCell(frame, predicate) {
  return frame.cells.find(predicate)?.style;
}

function tokenStyle(token, extra = {}) {
  return { fg: { kind: 'theme', token }, ...extra };
}

test('button and text input use user style slots', () => {
  const buttonFrame = renderWidgetFrame(button({
    label: 'Save',
    styles: {
      label: tokenStyle('status.success'),
      focused: tokenStyle('status.success')
    }
  }), { columns: 12, rows: 1 });
  const inputFrame = renderWidgetFrame(textInput({
    value: 'abc',
    styles: {
      value: tokenStyle('status.warning'),
      focused: tokenStyle('status.warning')
    }
  }), { columns: 12, rows: 1 });

  assert.equal(styleFor(buttonFrame, 'S')?.fg?.token, 'status.success');
  assert.equal(styleFor(inputFrame, 'a')?.fg?.token, 'status.warning');
});

test('menu palette table and tree use selected placeholder and title slots', () => {
  const menuFrame = renderWidgetFrame(menuBar({
    selected: 'file',
    items: [
      { id: 'file', label: 'File' },
      { id: 'edit', label: 'Edit' }
    ],
    styles: {
      selected: tokenStyle('status.success')
    }
  }), { columns: 20, rows: 1 });
  const paletteFrame = renderWidgetFrame(palette({
    title: 'Commands',
    entries: [],
    styles: {
      title: tokenStyle('status.error'),
      placeholder: tokenStyle('status.warning')
    }
  }), { columns: 24, rows: 3 });
  const tableFrame = renderWidgetFrame(table({
    rows: [],
    columns: [{ header: 'Name' }],
    emptyText: 'No data',
    styles: {
      placeholder: tokenStyle('status.warning')
    }
  }), { columns: 20, rows: 2 });
  const treeFrame = renderWidgetFrame(tree({
    selected: 'api',
    nodes: [{ id: 'api', label: 'API' }],
    styles: {
      selected: tokenStyle('status.success')
    }
  }), { columns: 16, rows: 1 });

  assert.equal(styleFor(menuFrame, 'F')?.fg?.token, 'status.success');
  assert.equal(styleFor(paletteFrame, 'C')?.fg?.token, 'status.error');
  assert.equal(styleFor(paletteFrame, 'N')?.fg?.token, 'status.warning');
  assert.equal(styleForCell(tableFrame, (cell) => cell.row > 1 && cell.text === 'N')?.fg?.token, 'status.warning');
  assert.equal(styleFor(treeFrame, 'A')?.fg?.token, 'status.success');
});

test('scrollback and modal chrome use placeholder and border slots', () => {
  const scrollbackFrame = renderWidgetFrame(scrollback({
    items: Array.from({ length: 5 }, (_value, index) => ({ id: `row-${String(index)}`, text: `Row ${String(index)}` })),
    styles: {
      placeholder: tokenStyle('status.warning')
    }
  }), { columns: 36, rows: 2 });
  const modalFrame = renderWidgetFrame(modal(
    text('Body'),
    {
      title: 'Panel',
      styles: {
        border: tokenStyle('status.error')
      }
    }
  ), { columns: 16, rows: 5 });

  assert.equal(styleFor(scrollbackFrame, '.')?.fg?.token, 'status.warning');
  assert.equal(styleFor(modalFrame, '┌')?.fg?.token, 'status.error');
});
