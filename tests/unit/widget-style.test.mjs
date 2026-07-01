import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  button,
  menuBar,
  modal,
  panel,
  palette,
  row,
  scrollback,
  stack,
  table,
  text,
  textInput,
  topBar,
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

test('semantic text roles and component anatomy use shared visual grammar', () => {
  const textFrame = renderWidgetFrame(stack([
    text('42', { textRole: 'metric' }),
    text('quiet', { textRole: 'caption' }),
    text('risk', { textRole: 'danger' })
  ]), { columns: 16, rows: 4 });
  const panelFrame = renderWidgetFrame(panel({
    id: 'status-panel',
    title: 'Harbor',
    actions: text('Edit', { textRole: 'badge' }),
    body: text('Body'),
    status: text('Ready', { textRole: 'success' }),
    density: 'compact'
  }), { columns: 32, rows: 8 });

  assert.equal(styleFor(textFrame, '4')?.fg?.token, 'accent.primary');
  assert.equal(styleFor(textFrame, 'q')?.fg?.token, 'text.muted');
  assert.equal(styleFor(textFrame, 'r')?.fg?.token, 'status.error');
  assert.equal(styleFor(panelFrame, 'H')?.fg?.token, 'text.strong');
  assert.equal(styleFor(panelFrame, 'E')?.bg?.token, 'selection.background');
  assert.equal(styleFor(panelFrame, 'R')?.fg?.token, 'status.success');
});

test('overflow priority preserves important row content before decorative content', () => {
  const frame = renderWidgetFrame(row([
    text('REQUIRED', { overflowPriority: 'required' }),
    text('secondary', { overflowPriority: 'secondary' }),
    text('decorative', { overflowPriority: 'decorative' })
  ], { gap: 0 }), { columns: 11, rows: 1 });

  assert.equal(renderFramePlain(frame).trimEnd(), 'REQUIREDsed');
});

test('chrome components assign overflow priority through ordinary widget metadata', () => {
  const trailing = text('Ready', { overflowPriority: 'required' });
  const widget = topBar({
    title: 'Northstar',
    center: text('secondary route'),
    trailing
  });
  const content = widget.children?.[0];
  const children = content?.children ?? [];

  assert.equal(children[0]?.layer?.overflowPriority, 'required');
  assert.equal(children[1]?.layer?.overflowPriority, 'secondary');
  assert.equal(children[2], trailing);
  assert.equal(children[2]?.layer?.overflowPriority, 'required');
});
