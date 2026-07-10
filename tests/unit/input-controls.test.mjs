import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  checkbox,
  checkboxList,
  colorPicker,
  datePicker,
  rangeSlider,
  selectBox,
  slider,
  toggleSwitch
} from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { stack } from '../../dist/layout/index.js';

test('toggleSwitch slider and rangeSlider render caller-owned values with keyboard and mouse affordances', () => {
  const widget = stack([
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
      start: 20,
      end: 80,
      min: 0,
      max: 100,
      width: 11,
      onChange: (value) => ({ kind: 'range', value })
    })
  ], { gap: 1 });
  const frame = renderElementFrame(widget, { columns: 56, rows: 7 });
  const output = renderFramePlain(frame);

  assert.match(output, /Live updates: \[ On \] Off/u);
  assert.match(output, /Volume: ━+●/u);
  assert.match(output, /Window: ─+●━+●/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'switch:control'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'slider:value:5'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'range:value:8'));
  assert.deepEqual(frame.accessibility.root.children?.[0]?.checked, true);
  assert.equal(frame.accessibility.root.children?.[1]?.role, 'progressbar');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.ownerKind, 'toggleSwitch');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.label, 'value.on.open');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'slider' && cell.text === '●')?.source?.label, 'track.handle');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'range' && cell.source?.label === 'track.startHandle')?.text, '●');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'range' && cell.source?.label === 'track.endHandle')?.text, '●');
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
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, initialFocusPath: ['volume'] });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'arrowLeft' });
  assert.equal(runtime.getState()?.value, 4);
  await runtime.handleInput({ kind: 'key', key: 'arrowRight' });
  assert.equal(runtime.getState()?.value, 5);

  await runtime.dispose();
});

test('checkboxList colorPicker and datePicker expose selectable item hit targets and accessibility', () => {
  const widget = stack([
    checkboxList({
      id: 'check-list',
      label: 'Channels',
      options: [
        { id: 'email', label: 'Email', value: 'email' },
        { id: 'sms', label: 'SMS', value: 'sms' }
      ],
      selected: ['email'],
      onChange: (option, checked) => ({ kind: 'channel', id: option.id, checked })
    }),
    colorPicker({
      id: 'colors',
      label: 'Accent',
      selected: 'green',
      columns: 2,
      options: [
        { id: 'green', label: 'Green', value: 'green', swatch: '■' },
        { id: 'blue', label: 'Blue', value: 'blue', swatch: '◆' }
      ],
      onChange: (option) => ({ kind: 'color', id: option.id })
    }),
    datePicker({
      id: 'dates',
      label: 'June',
      selected: '2026-06-15',
      days: Array.from({ length: 21 }, (_, index) => {
        const day = index + 1;
        return {
          id: `2026-06-${String(day).padStart(2, '0')}`,
          label: String(day),
          value: `2026-06-${String(day).padStart(2, '0')}`,
          today: day === 10
        };
      }),
      onChange: (day) => ({ kind: 'date', id: day.id })
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
    row: 16,
    column: 9,
    width: 4,
    height: 1
  });
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.checked, true);
  assert.equal(frame.accessibility.root.children?.[1]?.children?.[0]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[2]?.role, 'table');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'check-list' && cell.text === 'x')?.source?.label, 'option.email.marker.checked');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'check-list' && cell.text === 'x')?.source?.role, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.text === 'S')?.source?.label, 'summary.label');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.source?.label === 'summary.swatch')?.style?.bg?.token, 'control.primary.background');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.source?.label === 'summary.swatch')?.source?.role, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'colors' && cell.source?.label === 'option.green.swatch')?.text, '■');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'dates' && cell.source?.label === 'weekday.mo')?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'dates' && cell.text === '[')?.source?.label, 'day.2026-06-15.open');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'dates' && cell.text === '1')?.source?.role, 'text');
});

test('form controls keep state visible in high contrast and no-color projections', () => {
  const widget = stack([
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
    selectBox({
      id: 'region',
      label: 'Region',
      placeholder: 'Select region',
      options: [{ id: 'eu', label: 'Europe', value: 'eu' }]
    }),
    datePicker({
      id: 'calendar',
      selected: 'today',
      days: [{ id: 'today', label: '2', value: 'today', today: true }]
    })
  ], { gap: 1 });
  const frame = renderElementFrame(widget, { columns: 32, rows: 8 }, { theme: highContrastTheme });
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
