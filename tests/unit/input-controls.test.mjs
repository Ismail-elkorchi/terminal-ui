import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  checkboxList,
  colorPicker,
  datePicker,
  rangeSlider,
  slider,
  stack,
  toggleSwitch
} from '../../dist/widgets/index.js';

test('toggleSwitch slider and rangeSlider render caller-owned values with keyboard and mouse affordances', () => {
  const widget = stack([
    toggleSwitch({
      id: 'switch',
      label: 'Live updates',
      checked: true,
      message: { kind: 'toggle' }
    }),
    slider({
      id: 'slider',
      label: 'Volume',
      value: 50,
      min: 0,
      max: 100,
      width: 11,
      decrementMessage: { kind: 'volumeDown' },
      incrementMessage: { kind: 'volumeUp' },
      toMessage: (value) => ({ kind: 'volume', value })
    }),
    rangeSlider({
      id: 'range',
      label: 'Window',
      start: 20,
      end: 80,
      min: 0,
      max: 100,
      width: 11,
      toMessage: (value) => ({ kind: 'range', value })
    })
  ], { gap: 1 });
  const frame = renderWidgetFrame(widget, { columns: 56, rows: 7 });
  const output = renderFramePlain(frame);

  assert.match(output, /Live updates: \[ On \] Off/u);
  assert.match(output, /Volume: ━+●/u);
  assert.match(output, /Window: ─+●━+●/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'switch:control'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'slider:value:5'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'range:value:8'));
  assert.deepEqual(frame.accessibility.root.children?.[0]?.checked, true);
  assert.equal(frame.accessibility.root.children?.[1]?.role, 'progressbar');
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
      toMessage: (option, checked) => ({ kind: 'channel', id: option.id, checked })
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
      toMessage: (option) => ({ kind: 'color', id: option.id })
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
      toMessage: (day) => ({ kind: 'date', id: day.id })
    })
  ], { gap: 1 });
  const frame = renderWidgetFrame(widget, { columns: 72, rows: 16 });
  const output = renderFramePlain(frame);

  assert.match(output, /Channels/u);
  assert.match(output, /\[x\] Email/u);
  assert.match(output, /\[ \] SMS/u);
  assert.match(output, /Accent/u);
  assert.match(output, /\[■ Green/u);
  assert.match(output, /June/u);
  assert.match(output, /\[15\]/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'check-list:sms'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'colors:blue'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'dates:2026-06-10'));
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.checked, true);
  assert.equal(frame.accessibility.root.children?.[1]?.children?.[0]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[2]?.role, 'table');
});
