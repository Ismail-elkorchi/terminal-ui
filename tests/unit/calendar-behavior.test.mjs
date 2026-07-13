import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarDateId,
  calendarPresentation,
  calendarReducer
} from '../../dist/behavior/index.js';
import { calendar } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

const policy = Object.freeze({ locale: 'en-US', weekStartsOn: 1 });

test('date picker projection creates a deterministic six-week civil calendar', () => {
  const presentation = calendarPresentation({
    visibleMonth: { year: 2024, month: 2 },
    selected: { year: 2024, month: 2, day: 29 },
    focused: { year: 2024, month: 2, day: 29 }
  }, {
    ...policy,
    today: { year: 2024, month: 2, day: 20 },
    outsideMonth: 'hidden'
  });

  assert.equal(presentation.monthLabel, 'February 2024');
  assert.deepEqual(presentation.weekdays, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(presentation.days.length, 42);
  assert.equal(presentation.selected, '2024-02-29');
  assert.equal(presentation.days.find((day) => day.id === '2024-02-29')?.label, '29');
  assert.equal(presentation.days.find((day) => day.id === '2024-02-20')?.today, true);
  assert.equal(presentation.days[0]?.hidden, true);
});

test('date picker reducer navigates focus across month boundaries and skips disabled dates', () => {
  const state = {
    visibleMonth: { year: 2026, month: 6 },
    focused: { year: 2026, month: 6, day: 5 }
  };
  const moved = calendarReducer(state, { kind: 'moveFocus', days: 1 }, {
    ...policy,
    isDisabled: (date) => date.day === 6 || date.day === 7
  });
  const nextMonth = calendarReducer(moved, { kind: 'moveMonth', months: 1 }, policy);
  const selected = calendarReducer(nextMonth, { kind: 'select', date: { year: 2026, month: 7, day: 8 } }, policy);

  assert.deepEqual(moved.focused, { year: 2026, month: 6, day: 8 });
  assert.deepEqual(nextMonth.visibleMonth, { year: 2026, month: 7 });
  assert.deepEqual(selected.selected, { year: 2026, month: 7, day: 8 });
  assert.equal(calendarDateId(selected.selected), '2026-07-08');
});

test('date picker component routes keyboard and pointer through CalendarAction', async () => {
  const app = defineTui({
    id: 'calendar-actions',
    init: () => ({
      visibleMonth: { year: 2026, month: 6 },
      focused: { year: 2026, month: 6, day: 15 }
    }),
    update: (state, action) => ({ state: calendarReducer(state, action, policy) }),
    view: (state) => calendar({
      id: 'calendar',
      ...calendarPresentation(state, policy),
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ viewport: { columns: 34, rows: 9 } })
  });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'arrowRight',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });
  assert.deepEqual(runtime.getState().focused, { year: 2026, month: 6, day: 16 });
  assert.match(renderFramePlain(runtime.frame()), /June 2026/u);
  assert.ok(runtime.frame().hitTargets.some((target) => target.id === 'calendar:month:next'));
  await runtime.dispose();
});

test('date picker validates civil dates and explicit locale policy', () => {
  assert.throws(
    () => calendarPresentation({ visibleMonth: { year: 2023, month: 2 } }, {
      ...policy,
      min: { year: 2023, month: 2, day: 29 }
    }),
    /invalid calendar date/u
  );
  assert.throws(
    () => calendarPresentation({ visibleMonth: { year: 2026, month: 6 } }, { locale: '', weekStartsOn: 1 }),
    /locale must not be empty/u
  );
});
