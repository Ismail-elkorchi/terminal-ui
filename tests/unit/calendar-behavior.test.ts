import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarDateId,
  calendarPresentation,
  calendarReducer
} from '../../dist/behavior/index.js';
import type { CalendarBehaviorOptions, CalendarState } from '../../dist/behavior/index.js';
import { calendar } from '../../dist/components/index.js';
import type { CalendarAction } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

const policy = Object.freeze({
  locale: 'en-US',
  weekStartsOn: 1
} satisfies CalendarBehaviorOptions);

void test('date picker projection creates a deterministic six-week civil calendar', () => {
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

void test('date picker reducer navigates focus across month boundaries and skips disabled dates', () => {
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

void test('date picker month movement keeps focus inside the rendered selectable grid', () => {
  const state = {
    visibleMonth: { year: 2026, month: 6 },
    focused: { year: 2026, month: 6, day: 30 }
  };
  const options = {
    ...policy,
    isDisabled: (date) => date.month === 7 && date.day === 30
  } satisfies CalendarBehaviorOptions;
  const moved = calendarReducer(state, { kind: 'moveMonth', months: 1 }, options);
  const presentation = calendarPresentation(moved, options);
  const focused = presentation.days.find((day) => day.id === presentation.focused);

  assert.deepEqual(moved.visibleMonth, { year: 2026, month: 7 });
  assert.ok(focused);
  assert.equal(focused.disabled, undefined);
  assert.notEqual(presentation.focused, '2026-06-30');
});

void test('date picker clears focus when its explicit search policy cannot find a selectable date', () => {
  const state = {
    visibleMonth: { year: 2026, month: 6 },
    focused: { year: 2026, month: 6, day: 15 }
  };
  const moved = calendarReducer(state, { kind: 'moveFocus', days: 1 }, {
    ...policy,
    focusSearchLimitDays: 2,
    isDisabled: () => true
  });

  assert.equal(moved.focused, undefined);
  assert.throws(
    () => calendarPresentation(state, { ...policy, focusSearchLimitDays: -1 }),
    /non-negative safe integer/u
  );
});

void test('date picker component routes keyboard and pointer through CalendarAction', async () => {
  const app = defineTui<CalendarState, CalendarAction>({
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
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  assert.deepEqual(runtime.state().focused, { year: 2026, month: 6, day: 16 });
  const frame = runtime.frame();
  assert.ok(frame);
  assert.match(renderFramePlain(frame), /June 2026/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'calendar:month:next'));
  await runtime.dispose();
});

void test('date picker validates civil dates and explicit locale policy', () => {
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
