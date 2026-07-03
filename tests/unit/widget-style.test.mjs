import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  activityIndicator,
  barChart,
  button,
  chart,
  checkboxList,
  colorPicker,
  datePicker,
  helpBar,
  heatmap,
  list,
  menuBar,
  modal,
  notificationStack,
  palette,
  progressBar,
  row,
  scrollback,
  slider,
  spinner,
  stack,
  statusBar,
  structuredBlock,
  table,
  tabs,
  text,
  textArea,
  textInput,
  toggleSwitch,
  tree
} from '../../dist/widgets/index.js';

function styleFor(frame, textValue) {
  return frame.cells.find((cell) => cell.text === textValue)?.style;
}

function styleForCell(frame, predicate) {
  return frame.cells.find(predicate)?.style;
}

function stylesFor(frame, textValue) {
  return frame.cells.filter((cell) => cell.text === textValue).map((cell) => cell.style);
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

test('button states use shared styles and structural markers', () => {
  const focusedFrame = renderWidgetFrame(button({
    id: 'focus',
    label: 'Focus'
  }), { columns: 16, rows: 1 }, { focusPath: ['focus'] });
  const pendingFrame = renderWidgetFrame(button({
    label: 'Sync',
    pending: true
  }), { columns: 16, rows: 1 });
  const destructiveFrame = renderWidgetFrame(button({
    label: 'Delete',
    tone: 'destructive'
  }), { columns: 18, rows: 1 });
  const pressedFrame = renderWidgetFrame(button({
    label: 'Pinned',
    pressed: true
  }), { columns: 18, rows: 1 });
  const disabledFrame = renderWidgetFrame(button({
    label: 'Disabled',
    disabled: true
  }), { columns: 20, rows: 1 });

  assert.equal(renderFramePlain(focusedFrame).trimEnd(), '›[ Focus ]');
  assert.equal(renderFramePlain(pendingFrame).trimEnd(), '[ i Sync ]');
  assert.equal(renderFramePlain(destructiveFrame).trimEnd(), '[ × Delete ]');
  assert.equal(renderFramePlain(pressedFrame).trimEnd(), '[ ● Pinned ]');
  assert.equal(renderFramePlain(disabledFrame).trimEnd(), '[ - Disabled ]');
  assert.equal(styleFor(pendingFrame, 'S')?.fg?.token, 'status.pending');
  assert.equal(styleFor(destructiveFrame, 'D')?.fg?.token, 'status.error');
  assert.equal(styleFor(pressedFrame, 'P')?.bg?.token, 'selection.background');
  assert.equal(styleFor(disabledFrame, 'D')?.fg?.token, 'text.muted');
  assert.equal(focusedFrame.cells.find((cell) => cell.text === '›')?.source?.label, 'chrome.focus');
  assert.equal(focusedFrame.cells.find((cell) => cell.text === '[')?.source?.label, 'chrome.open');
  assert.equal(pendingFrame.cells.find((cell) => cell.text === 'i')?.source?.label, 'state.marker');
  assert.equal(destructiveFrame.cells.find((cell) => cell.text === '×')?.source?.label, 'state.marker');
  assert.equal(pressedFrame.cells.find((cell) => cell.text === '●')?.source?.label, 'state.marker');
  assert.equal(disabledFrame.cells.find((cell) => cell.text === '-')?.source?.label, 'state.marker');
  assert.equal(disabledFrame.cells.find((cell) => cell.text === 'D')?.source?.label, 'label');
});

test('text entry chrome uses shared border focus and error styles', () => {
  const inputFrame = renderWidgetFrame(textInput({
    id: 'query',
    value: 'abc',
    styles: {
      border: tokenStyle('status.info'),
      focused: tokenStyle('status.success')
    }
  }), { columns: 16, rows: 1 }, { focusPath: ['query'] });
  const areaFrame = renderWidgetFrame(textArea({
    id: 'body',
    value: 'details',
    error: 'Required',
    styles: {
      error: tokenStyle('status.error')
    }
  }), { columns: 16, rows: 2 });

  assert.equal(renderFramePlain(inputFrame).trimEnd(), '›[ abc ]');
  assert.equal(styleFor(inputFrame, '›')?.fg?.token, 'status.success');
  assert.equal(renderFramePlain(areaFrame).split('\n')[0], '× details');
  assert.equal(styleFor(areaFrame, '×')?.fg?.token, 'status.error');
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

test('list table and tree share data navigation selection and match styles', () => {
  const listFrame = renderWidgetFrame(list({
    items: ['Atlas', 'Pulse'],
    selected: 0,
    filterQuery: 'at'
  }), { columns: 18, rows: 2 });
  const tableFrame = renderWidgetFrame(table({
    selected: 0,
    columns: [{ header: 'Name', width: 8 }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const activeTableFrame = renderWidgetFrame(table({
    selectedCell: { row: 0, column: 0 },
    columns: [{ header: 'Name', width: 8 }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const treeFrame = renderWidgetFrame(tree({
    filterQuery: 'api',
    nodes: [{
      id: 'root',
      label: 'Workspace',
      expanded: true,
      children: [{ id: 'api', label: 'API Layer' }]
    }]
  }), { columns: 24, rows: 3 });

  assert.equal(styleForCell(listFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(listFrame, (cell) => cell.text === 'A')?.fg?.token, 'menu.match');
  assert.equal(styleForCell(tableFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(activeTableFrame, (cell) => cell.text === 'A')?.fg?.token, 'accent.secondary');
  assert.equal(styleForCell(activeTableFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(treeFrame, (cell) => cell.text === '▾')?.fg?.token, 'tree.branch');
  assert.equal(styleForCell(treeFrame, (cell) => cell.text === 'A')?.fg?.token, 'menu.match');
  assert.equal(listFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'item.0.match');
  assert.equal(tableFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'row.0.cell.0');
  assert.equal(activeTableFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'row.0.cell.0');
  assert.equal(treeFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'node.api.match');
});

test('tabs use shared selected disabled and value styles', () => {
  const frame = renderWidgetFrame(tabs({
    id: 'tabs',
    selected: 'data',
    keyMap: { enter: { kind: 'activate-tabs' } },
    tabs: [
      { id: 'dash', label: 'Dash', panel: text('Dashboard') },
      { id: 'data', label: 'Data', panel: text('Data view') },
      { id: 'audit', label: 'Audit', disabled: true, panel: text('Audit view') }
    ],
    styles: {
      value: tokenStyle('text.muted'),
      selected: tokenStyle('status.success'),
      focused: tokenStyle('accent.primary', { underline: true }),
      disabled: tokenStyle('status.warning')
    }
  }), { columns: 32, rows: 3 }, { focusPath: ['tabs'] });
  const dStyles = stylesFor(frame, 'D');
  const selectedLabel = frame.cells.find((cell) => cell.source?.id === 'data' && cell.source?.label === 'label');

  assert.equal(dStyles[0]?.fg?.token, 'text.muted');
  assert.equal(selectedLabel?.style?.fg?.token, 'accent.primary');
  assert.equal(selectedLabel?.style?.underline, true);
  assert.equal(styleFor(frame, 'A')?.fg?.token, 'status.warning');
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
      width: 14,
      height: 6,
      actions: row([button({ label: 'OK' })]),
      styles: {
        border: tokenStyle('status.error')
      }
    }
  ), { columns: 16, rows: 5 });

  assert.equal(styleFor(scrollbackFrame, '.')?.fg?.token, 'status.warning');
  assert.equal(styleFor(modalFrame, '┌')?.fg?.token, 'status.error');
  assert.equal(styleForCell(modalFrame, (cell) => cell.source?.kind === 'modal' && cell.source.label === 'action-separator')?.fg?.token, 'status.error');
});

test('semantic text roles use shared visual grammar', () => {
  const textFrame = renderWidgetFrame(stack([
    text('42', { textRole: 'metric' }),
    text('quiet', { textRole: 'caption' }),
    text('risk', { textRole: 'danger' })
  ]), { columns: 16, rows: 4 });

  assert.equal(styleFor(textFrame, '4')?.fg?.token, 'accent.primary');
  assert.equal(styleFor(textFrame, 'q')?.fg?.token, 'text.muted');
  assert.equal(styleFor(textFrame, 'r')?.fg?.token, 'status.error');
});

test('overflow priority preserves important row content before decorative content', () => {
  const frame = renderWidgetFrame(row([
    text('REQUIRED', { overflowPriority: 'required' }),
    text('secondary', { overflowPriority: 'secondary' }),
    text('decorative', { overflowPriority: 'decorative' })
  ], { gap: 0 }), { columns: 11, rows: 1 });

  assert.equal(renderFramePlain(frame).trimEnd(), 'REQUIREDsed');
});

test('feedback widgets use shared status styles and source metadata', () => {
  const statusFrame = renderWidgetFrame(statusBar({
    id: 'status',
    text: 'Ready',
    styles: {
      value: tokenStyle('status.success')
    }
  }), { columns: 16, rows: 1 });
  const helpFrame = renderWidgetFrame(helpBar({
    id: 'help',
    bindings: [
      { key: 'Enter', label: 'open' },
      { key: 'Esc', label: 'close' }
    ],
    styles: {
      label: tokenStyle('accent.primary')
    }
  }), { columns: 32, rows: 1 });
  const activityFrame = renderWidgetFrame(activityIndicator({
    id: 'activity',
    label: 'Indexing',
    status: 'warning'
  }), { columns: 32, rows: 1 });
  const spinnerFrame = renderWidgetFrame(spinner({
    id: 'spinner',
    label: 'Loaded',
    status: 'success'
  }), { columns: 32, rows: 1 });
  const progressFrame = renderWidgetFrame(progressBar({
    id: 'progress',
    label: 'Upload',
    value: 2,
    max: 4,
    barWidth: 4,
    showPercentage: true,
    status: 'error'
  }), { columns: 32, rows: 1 });

  assert.equal(styleFor(statusFrame, 'R')?.fg?.token, 'status.success');
  assert.equal(statusFrame.cells.find((cell) => cell.text === 'R')?.source?.kind, 'statusBar');
  assert.equal(styleFor(helpFrame, 'E')?.fg?.token, 'accent.primary');
  assert.equal(helpFrame.cells.find((cell) => cell.text === 'E')?.source?.label, 'binding.0.key');
  assert.equal(styleFor(activityFrame, '!')?.fg?.token, 'status.warning');
  assert.equal(activityFrame.cells.find((cell) => cell.text === '!')?.source?.label, 'status.marker');
  assert.equal(styleFor(spinnerFrame, '✓')?.fg?.token, 'status.success');
  assert.equal(spinnerFrame.cells.find((cell) => cell.text === '✓')?.source?.label, 'status.marker');
  assert.equal(styleFor(progressFrame, '█')?.fg?.token, 'status.error');
  assert.equal(progressFrame.cells.find((cell) => cell.text === '█')?.source?.label, 'progress.filled');
});

test('record and notification widgets use shared semantic status contracts', () => {
  const failedBlockFrame = renderWidgetFrame(structuredBlock({
    id: 'failed-block',
    title: 'Import',
    status: 'failed'
  }), { columns: 32, rows: 2 });
  const skippedBlockFrame = renderWidgetFrame(structuredBlock({
    id: 'skipped-block',
    title: 'Import',
    status: 'skipped'
  }), { columns: 32, rows: 2 });
  const notificationFrame = renderWidgetFrame(notificationStack({
    id: 'notices',
    items: [{
      id: 'sync',
      title: 'Sync',
      tone: 'progress',
      progress: 50
    }]
  }), { columns: 42, rows: 6 });

  assert.equal(styleFor(failedBlockFrame, 'f')?.fg?.token, 'status.error');
  assert.equal(styleFor(skippedBlockFrame, 's')?.fg?.token, 'status.warning');
  assert.equal(styleFor(notificationFrame, '█')?.fg?.token, 'status.running');
});

test('chart widgets use shared visual state styles and source metadata', () => {
  const barFrame = renderWidgetFrame(barChart({
    id: 'bars',
    selected: 0,
    items: [{ label: 'Atlas', value: 5 }],
    styles: {
      selected: tokenStyle('status.success'),
      value: tokenStyle('accent.primary')
    }
  }), { columns: 24, rows: 1 });
  const chartFrame = renderWidgetFrame(chart({
    id: 'chart',
    status: 'error',
    errorText: 'Unavailable'
  }), { columns: 24, rows: 1 });
  const heatmapFrame = renderWidgetFrame(heatmap({
    id: 'heatmap',
    rows: [[{ id: 'a', value: 3 }]],
    min: 0,
    max: 3,
    styles: {
      value: tokenStyle('status.warning')
    }
  }), { columns: 8, rows: 1 });

  assert.equal(styleFor(barFrame, 'A')?.fg?.token, 'status.success');
  assert.equal(barFrame.cells.find((cell) => cell.text === 'A')?.source?.kind, 'barChart');
  assert.equal(styleFor(chartFrame, 'U')?.fg?.token, 'status.error');
  assert.equal(chartFrame.cells.find((cell) => cell.text === 'U')?.source?.label, 'state.error.message');
  assert.equal(styleFor(heatmapFrame, '█')?.fg?.token, 'status.warning');
  assert.equal(heatmapFrame.cells.find((cell) => cell.text === '█')?.source?.label, 'cell.0.0.value');
});

test('choice and picker controls use shared form visual styles and source metadata', () => {
  const toggleFrame = renderWidgetFrame(toggleSwitch({
    id: 'toggle',
    label: 'Live',
    checked: true
  }), { columns: 24, rows: 1 });
  const sliderFrame = renderWidgetFrame(slider({
    id: 'slider',
    label: 'Volume',
    value: 50,
    min: 0,
    max: 100,
    width: 5
  }), { columns: 24, rows: 1 });
  const checkboxFrame = renderWidgetFrame(checkboxList({
    id: 'checks',
    selected: ['a'],
    options: [{ id: 'a', label: 'Alpha', value: 'a' }]
  }), { columns: 24, rows: 1 });
  const colorFrame = renderWidgetFrame(colorPicker({
    id: 'colors',
    selected: 'green',
    options: [{ id: 'green', label: 'Green', value: 'green', swatch: '■' }]
  }), { columns: 24, rows: 2 });
  const dateFrame = renderWidgetFrame(datePicker({
    id: 'dates',
    selected: 'today',
    days: [{ id: 'today', label: '2', value: 'today' }]
  }), { columns: 8, rows: 2 });

  assert.equal(styleForCell(toggleFrame, (cell) => cell.source?.label === 'value.on')?.bg?.token, 'selection.background');
  assert.equal(toggleFrame.cells.find((cell) => cell.source?.label === 'value.off')?.style?.fg?.token, 'input.placeholder');
  assert.equal(styleForCell(sliderFrame, (cell) => cell.source?.label === 'track.handle')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(sliderFrame, (cell) => cell.source?.label === 'track.filled')?.fg?.token, 'accent.secondary');
  assert.equal(checkboxFrame.cells.find((cell) => cell.text === 'x')?.source?.label, 'option.marker.checked');
  assert.equal(styleForCell(colorFrame, (cell) => cell.source?.label === 'summary.swatch')?.bg?.token, 'selection.background');
  assert.equal(colorFrame.cells.find((cell) => cell.source?.label === 'option.green.swatch')?.text, '■');
  assert.equal(dateFrame.cells.find((cell) => cell.source?.label === 'weekday.mo')?.style?.fg?.token, 'text.muted');
  assert.equal(dateFrame.cells.find((cell) => cell.text === '[')?.source?.label, 'day.today.open');
});
