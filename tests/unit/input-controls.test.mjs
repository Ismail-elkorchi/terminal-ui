import assert from 'node:assert/strict';
import test from 'node:test';

import { rangeSliderReducer } from '../../dist/behavior/index.js';
import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  checkbox,
  checkboxGroup,
  colorSwatchPicker,
  calendar,
  rangeSlider,
  select,
  slider,
  toggleSwitch
} from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { column } from '../../dist/layout/index.js';
import { calendarFixture } from '../helpers/calendar.mjs';

test('toggleSwitch slider and rangeSlider render caller-owned values with keyboard and mouse affordances', () => {
  const widget = column([
    toggleSwitch({
      id: 'switch',
      label: 'Live updates',
      checked: true,
      onChange: () => ({ kind: 'toggle' })
    }),
    slider({
      id: 'slider',
      label: 'Volume',
      value: 50,
      min: 0,
      max: 100,
      width: 11,
      onStep: ({ direction }) => ({ kind: direction === 'decrement' ? 'volumeDown' : 'volumeUp' }),
      onChange: (value) => ({ kind: 'volume', value })
    }),
    rangeSlider({
      id: 'range',
      label: 'Window',
      state: { value: { start: 20, end: 80 }, activeHandle: 'start' },
      range: { min: 0, max: 100 },
      width: 11,
      onAction: (action) => ({ kind: 'range', action })
    })
  ], { gap: 1 });
  const frame = renderElementFrame(widget, { columns: 56, rows: 7 });
  const output = renderFramePlain(frame);

  assert.match(output, /Live updates: \[ On \] Off/u);
  assert.match(output, /Volume: ━+●/u);
  assert.match(output, /Window: ─+●━+●/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'switch:control'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'slider:value:5'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'range:track'));
  assert.deepEqual(frame.accessibility.root.children?.[0]?.checked, true);
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'switch');
  assert.equal(frame.accessibility.root.children?.[1]?.role, 'slider');
  assert.equal(frame.accessibility.root.children?.[2]?.role, 'group');
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[0]?.role, 'slider');
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[0]?.selected, undefined);
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[0]?.numericValue?.current, 20);
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.ownerKind, 'toggleSwitch');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.label, 'value.on.open');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'slider' && cell.text === '●')?.source?.label, 'track.handle');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'range' && cell.source?.label === 'track.startHandle')?.text, '●');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'range' && cell.source?.label === 'track.endHandle')?.text, '●');
});

test('slider controls reject invalid authored numeric contracts consistently', () => {
  const validRangeState = { value: { start: 10, end: 20 }, activeHandle: 'start' };
  assert.throws(() => slider({ id: 'nan-slider', value: Number.NaN }), /value must be finite/u);
  assert.throws(() => slider({ id: 'bounds-slider', value: 1, min: 2, max: 1 }), /finite ordered bounds/u);
  assert.throws(() => slider({ id: 'step-slider', value: 1, step: 0 }), /step must be finite and greater than zero/u);
  assert.throws(() => slider({ id: 'width-slider', value: 1, width: 1.5 }), /width must be a positive safe integer/u);
  assert.throws(
    () => rangeSlider({ id: 'nan-range', state: { value: { start: Number.NaN, end: 20 }, activeHandle: 'start' } }),
    /value must be finite/u
  );
  assert.throws(
    () => rangeSlider({ id: 'ordered-range', state: { value: { start: 20, end: 10 }, activeHandle: 'start' } }),
    /start value must be less than or equal/u
  );
  assert.throws(
    () => rangeSlider({ id: 'width-range', state: validRangeState, width: 0 }),
    /width must be a positive safe integer/u
  );
});

test('slider generated bindings use normalized arrow-key identities', async () => {
  const app = defineTui({
    id: 'slider-arrow-identity',
    init: () => ({ value: 5 }),
    update: (_state, message) => ({ state: { value: message.value } }),
    view: (state) => slider({
      id: 'volume',
      value: state.value,
      min: 0,
      max: 10,
      onChange: (value) => ({ value })
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, initialFocus: { kind: 'path', path: ['volume'] } });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'arrowLeft', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.equal(runtime.state()?.value, 4);
  await runtime.handleInput({ kind: 'key', key: 'arrowRight', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.equal(runtime.state()?.value, 5);

  await runtime.dispose();
});

test('rangeSlider reducer moves only the active handle and preserves ordered values', () => {
  const options = { range: { min: 0, max: 100 }, step: 5 };
  const initial = { value: { start: 20, end: 80 }, activeHandle: 'end' };
  const stepped = rangeSliderReducer(initial, { kind: 'step', direction: 'decrement' }, options);
  const selected = rangeSliderReducer(stepped, { kind: 'selectHandle', handle: 'start' }, options);
  const moved = rangeSliderReducer(selected, { kind: 'step', direction: 'increment' }, options);
  const clamped = rangeSliderReducer(moved, { kind: 'set', handle: 'start', value: 90 }, options);

  assert.deepEqual(stepped, { value: { start: 20, end: 75 }, activeHandle: 'end' });
  assert.deepEqual(moved, { value: { start: 25, end: 75 }, activeHandle: 'start' });
  assert.deepEqual(clamped, { value: { start: 75, end: 75 }, activeHandle: 'start' });
});

test('rangeSlider pointer capture preserves the pressed handle and arrow keys use one axis', async () => {
  const options = { range: { min: 0, max: 100 }, step: 10 };
  const app = defineTui({
    id: 'range-slider-interaction',
    init: () => ({ range: { value: { start: 20, end: 80 }, activeHandle: 'end' } }),
    update: (state, message) => ({
      state: { range: rangeSliderReducer(state.range, message.action, options) }
    }),
    view: (state) => rangeSlider({
      id: 'window',
      state: state.range,
      range: options.range,
      step: options.step,
      width: 11,
      onAction: (action) => ({ action })
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, initialFocus: { kind: 'path', path: ['window'] } });
  const mouse = (action, row, column) => ({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action,
    button: 'left',
    row,
    column,
    rawCode: action === 'drag' ? 32 : 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  await runtime.start();
  const target = runtime.frame()?.hitTargets?.find((entry) => entry.id === 'window:track');
  assert.ok(target);
  const press = await runtime.handleInput(mouse('press', target.bounds.row, target.bounds.column + 8));
  const drag = await runtime.handleInput(mouse('drag', target.bounds.row, target.bounds.column + 4));
  assert.equal(press.handled, true);
  assert.equal(drag.handled, true);
  assert.deepEqual(runtime.state()?.range, {
    value: { start: 20, end: 40 },
    activeHandle: 'end'
  });

  await runtime.handleInput({ kind: 'key', key: 'arrowLeft', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.state()?.range, {
    value: { start: 20, end: 30 },
    activeHandle: 'end'
  });
  await runtime.handleInput({ kind: 'key', key: 'arrowUp', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.equal(runtime.state()?.range.value.end, 30);

  await runtime.dispose();
});

test('checkboxGroup colorSwatchPicker and calendar expose selectable item hit targets and accessibility', () => {
  const widget = column([
    checkboxGroup({
      id: 'check-list',
      label: 'Channels',
      options: [
        { id: 'email', label: 'Email', value: 'email' },
        { id: 'sms', label: 'SMS', value: 'sms' }
      ],
      selected: ['email'],
      onAction: (action) => ({ kind: 'channel', action })
    }),
    colorSwatchPicker({
      id: 'colors',
      label: 'Accent',
      selected: 'green',
      columns: 2,
      options: [
        { id: 'green', label: 'Green', value: 'green', swatch: '■' },
        { id: 'blue', label: 'Blue', value: 'blue', swatch: '◆' }
      ],
      onAction: (action) => ({ kind: 'color', action })
    }),
    calendar({
      id: 'dates',
      label: 'June',
      ...calendarFixture({
        selected: { year: 2026, month: 6, day: 15 },
        focused: { year: 2026, month: 6, day: 15 },
        today: { year: 2026, month: 6, day: 10 }
      }),
      onAction: (action) => ({ kind: 'date', action })
    })
  ], { gap: 1 });
  const frame = renderElementFrame(widget, { columns: 72, rows: 18 });
  const output = renderFramePlain(frame);

  assert.match(output, /Channels/u);
  assert.match(output, /\[x\] Email/u);
  assert.match(output, /\[ \] SMS/u);
  assert.match(output, /Accent/u);
  assert.match(output, /Selected: ■ Green/u);
  assert.match(output, /\[■ Green/u);
  assert.match(output, /June/u);
  assert.match(output, /Mo\s+Tu\s+We\s+Th\s+Fr\s+Sa\s+Su/u);
  assert.match(output, /\[15\]/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'check-list:sms'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'colors:blue'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'dates:2026-06-10'));
  assert.deepEqual(frame.hitTargets?.find((target) => target.id === 'colors:blue')?.bounds, {
    row: 9,
    column: 13,
    width: 12,
    height: 1
  });
  assert.deepEqual(frame.hitTargets?.find((target) => target.id === 'dates:2026-06-10')?.bounds, {
    row: 17,
    column: 9,
    width: 4,
    height: 1
  });
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.checked, true);
  assert.equal(frame.accessibility.root.children?.[1]?.children?.[0]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[2]?.role, 'grid');
  assert.deepEqual(frame.accessibility.root.children?.[2]?.children?.[0]?.position, {
    rowIndex: 1,
    rowCount: 6,
    columnCount: 7
  });
  assert.deepEqual(frame.accessibility.root.children?.[2]?.children?.[0]?.children?.[0]?.position, {
    rowIndex: 1,
    columnIndex: 1,
    columnCount: 7
  });
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'check-list' && cell.text === 'x')?.source?.label, 'option.email.marker.checked');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'check-list' && cell.text === 'x')?.source?.role, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.text === 'S')?.source?.label, 'summary.label');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.source?.label === 'summary.swatch')?.style?.bg?.token, 'control.primary.background');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.source?.label === 'summary.swatch')?.source?.role, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.source?.label === 'option.green.swatch')?.text, '■');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'dates' && cell.source?.label === 'weekday.0')?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'dates' && cell.source?.label === 'day.2026-06-15.open')?.text, '[');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'dates' && cell.text === '1')?.source?.role, 'text');
});

test('picker columns remain cell-aligned under ambiguous-wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const colorFrame = renderElementFrame(colorSwatchPicker({
    id: 'wide-colors',
    columns: 1,
    options: [{ id: 'dots', label: '··', value: 'dots', swatch: 'x' }]
  }), { columns: 20, rows: 2 }, { widthProfile });
  const calendarFrame = renderElementFrame(calendar({
    id: 'wide-calendar',
    monthLabel: 'Month',
    weekdays: ['··', '··', '··', '··', '··', '··', '··'],
    days: []
  }), { columns: 32, rows: 3 }, { widthProfile });

  assert.equal(
    colorFrame.cells.find((cell) => cell.source?.label === 'option.dots.close')?.column,
    12
  );
  assert.deepEqual(
    Array.from({ length: 7 }, (_value, index) => Math.min(
      ...calendarFrame.cells
        .filter((cell) => cell.source?.label === `weekday.${String(index)}`)
        .map((cell) => cell.column)
    )),
    [1, 5, 9, 13, 17, 21, 25]
  );
});

test('picker swatches remain inside their fixed cell budget under ambiguous-wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(colorSwatchPicker({
    id: 'wide-swatch',
    columns: 2,
    options: [
      { id: 'first', label: 'First', value: 1, swatch: '■' },
      { id: 'second', label: 'Second', value: 2, swatch: '◆' }
    ],
    onAction: () => ({ kind: 'select' })
  }), { columns: 24, rows: 1 }, { widthProfile });

  assert.equal(frame.cells.find((cell) => cell.source?.label === 'option.first.swatch')?.text, '*');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'option.second.open')?.column, 13);
  assert.deepEqual(frame.hitTargets?.find((target) => target.id === 'wide-swatch:second')?.bounds, {
    row: 1,
    column: 13,
    width: 12,
    height: 1
  });
});

test('form controls keep state visible in high contrast and no-color projections', () => {
  const widget = column([
    checkbox({
      id: 'agree',
      label: 'Agree',
      checked: true,
      required: true
    }),
    slider({
      id: 'volume',
      label: 'Volume',
      value: 50,
      min: 0,
      max: 100,
      width: 5
    }),
    select({
      id: 'region',
      label: 'Region',
      placeholder: 'Select region',
      presentation: { kind: 'closed' },
      options: [{ id: 'eu', label: 'Europe', value: 'eu' }]
    }),
    calendar({
      id: 'calendar',
      ...calendarFixture({
        selected: { year: 2026, month: 6, day: 2 },
        today: { year: 2026, month: 6, day: 2 }
      })
    })
  ], { gap: 1 });
  const frame = renderElementFrame(widget, { columns: 32, rows: 14 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.match(highContrast.plainTextFrame, /\[x\] Agree \*/u);
  assert.match(highContrast.plainTextFrame, /Volume: ━+●/u);
  assert.match(highContrast.plainTextFrame, /Region: Select region/u);
  assert.match(highContrast.plainTextFrame, /\[\s*2\]/u);
  assert.match(highContrast.ansiFrame, /\\x1b\[/u);
  assert.match(highContrast.frameJson, /"label": "label.required"/u);
  assert.match(highContrast.frameJson, /"label": "track.handle"/u);
  assert.match(highContrast.frameJson, /"label": "value.placeholder"/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
});

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}
