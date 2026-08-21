import type {
  CalendarDate,
  CalendarMonth,
  CalendarAction,
  CalendarDay,
  CalendarPresentation,
} from '../ui-model/calendar.ts';
import { adoptCalendarDate } from '../ui-model/calendar.ts';

export interface CalendarState {
  readonly visibleMonth: CalendarMonth;
  readonly selectedDate?: CalendarDate;
  readonly activeDate?: CalendarDate;
}

export interface CalendarBehaviorOptions {
  readonly locale: string;
  readonly weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly min?: CalendarDate;
  readonly max?: CalendarDate;
  readonly today?: CalendarDate;
  readonly outsideMonth?: 'hidden' | 'visible' | 'selectable';
  readonly focusSearchLimitDays?: number;
  isDisabled?(date: CalendarDate): boolean;
}

export const defaultCalendarFocusSearchLimitDays = 3660;

export function calendarReducer(
  state: CalendarState,
  action: CalendarAction,
  options: CalendarBehaviorOptions
): CalendarState {
  assertOptions(options);
  switch (action.kind) {
    case 'select':
      return selectable(action.date, options)
        ? { ...state, selectedDate: action.date, activeDate: action.date, visibleMonth: monthOf(action.date) }
        : state;
    case 'setActive':
      return selectable(action.date, options)
        ? { ...state, activeDate: action.date, visibleMonth: monthOf(action.date) }
        : state;
    case 'moveActive':
      return moveActive(state, action.days, options);
    case 'commitActive':
      return state.activeDate === undefined || !selectable(state.activeDate, options)
        ? state
        : { ...state, selectedDate: state.activeDate };
    case 'moveMonth':
      return moveVisibleMonth(state, action.months, options);
    case 'startOfWeek':
      return moveActive(state, -weekdayOffset(activeDate(state), options.weekStartsOn), options);
    case 'endOfWeek':
      return moveActive(state, 6 - weekdayOffset(activeDate(state), options.weekStartsOn), options);
  }
}

export function calendarPresentation(
  state: CalendarState,
  options: CalendarBehaviorOptions
): CalendarPresentation {
  assertOptions(options);
  const first = { ...state.visibleMonth, day: 1 };
  assertCalendarDate(first);
  const start = addDays(first, -weekdayOffset(first, options.weekStartsOn));
  const weekdays = Array.from({ length: 7 }, (_value, index) => weekdayLabel(addDays(start, index), options.locale));
  const days = calendarDays(state.visibleMonth, options);
  const activeId = state.activeDate === undefined ? undefined : calendarDateId(state.activeDate);
  const representedActive = activeId === undefined
    ? undefined
    : days.find((day) => day.id === activeId && day.disabled !== true)?.id;
  const selectedId = state.selectedDate === undefined ? undefined : calendarDateId(state.selectedDate);
  return {
    monthLabel: monthLabel(state.visibleMonth, options.locale),
    weekdays,
    days,
    interaction: {
      ...(representedActive === undefined ? {} : { activeId: representedActive }),
      selection: { mode: 'single', ...(selectedId === undefined ? {} : { selectedId }) },
    },
  };
}

export function calendarDateId(date: CalendarDate): string {
  assertCalendarDate(date);
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function compareDates(left: CalendarDate, right: CalendarDate): number {
  return epochMilliseconds(left) - epochMilliseconds(right);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(epochMilliseconds(date));
  value.setUTCDate(value.getUTCDate() + Math.trunc(days));
  return dateFromUtc(value);
}

export function addMonths(month: CalendarMonth, months: number): CalendarMonth {
  const value = utcDate({ ...month, day: 1 });
  value.setUTCMonth(value.getUTCMonth() + Math.trunc(months));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

function moveActive(
  state: CalendarState,
  days: number,
  options: CalendarBehaviorOptions
): CalendarState {
  const direction = Math.sign(days);
  let candidate = addDays(activeDate(state), days);
  const searchLimit = options.focusSearchLimitDays ?? defaultCalendarFocusSearchLimitDays;
  for (let attempts = 0; attempts <= searchLimit; attempts += 1) {
    if (selectable(candidate, options)) return { ...state, activeDate: candidate, visibleMonth: monthOf(candidate) };
    if (direction === 0 || outsideBounds(candidate, options, direction)) return withoutCalendarActive(state);
    candidate = addDays(candidate, direction);
  }
  return withoutCalendarActive(state);
}

function moveVisibleMonth(
  state: CalendarState,
  months: number,
  options: CalendarBehaviorOptions
): CalendarState {
  const visibleMonth = addMonths(state.visibleMonth, months);
  const day = Math.min(activeDate(state).day, daysInMonth(visibleMonth));
  const candidate = { ...visibleMonth, day };
  const active = nearestPresentedSelectableDate(visibleMonth, candidate, options);
  const next = withoutCalendarActive({ ...state, visibleMonth });
  return active === undefined ? next : { ...next, activeDate: active };
}

function calendarDays(
  visibleMonth: CalendarMonth,
  options: CalendarBehaviorOptions
): readonly CalendarDay[] {
  const first = { ...visibleMonth, day: 1 };
  const start = addDays(first, -weekdayOffset(first, options.weekStartsOn));
  const outsidePolicy = options.outsideMonth ?? 'visible';
  return Array.from({ length: 42 }, (_value, index): CalendarDay => {
    const date = addDays(start, index);
    const outsideMonth = date.year !== visibleMonth.year || date.month !== visibleMonth.month;
    const hidden = outsideMonth && outsidePolicy === 'hidden';
    const disabled = hidden || !selectable(date, options) || (outsideMonth && outsidePolicy !== 'selectable');
    return {
      id: calendarDateId(date),
      label: hidden ? '' : String(date.day),
      date,
      ...(disabled ? { disabled: true } : {}),
      ...(options.today !== undefined && compareDates(date, options.today) === 0 ? { today: true } : {}),
      ...(outsideMonth ? { outsideMonth: true } : {}),
      ...(hidden ? { hidden: true } : {})
    };
  });
}

function nearestPresentedSelectableDate(
  visibleMonth: CalendarMonth,
  candidate: CalendarDate,
  options: CalendarBehaviorOptions
): CalendarDate | undefined {
  return calendarDays(visibleMonth, options)
    .filter((day) => day.disabled !== true)
    .map((day) => day.date)
    .sort((left, right) => Math.abs(compareDates(left, candidate)) - Math.abs(compareDates(right, candidate)))[0];
}

function withoutCalendarActive<TState extends CalendarState>(state: TState): Omit<TState, 'activeDate'> {
  const { activeDate: discarded, ...rest } = state;
  void discarded;
  return rest;
}

function activeDate(state: CalendarState): CalendarDate {
  return state.activeDate ?? state.selectedDate ?? { ...state.visibleMonth, day: 1 };
}

function selectable(date: CalendarDate, options: CalendarBehaviorOptions): boolean {
  assertCalendarDate(date);
  if (options.min !== undefined && compareDates(date, options.min) < 0) return false;
  if (options.max !== undefined && compareDates(date, options.max) > 0) return false;
  return options.isDisabled?.(date) !== true;
}

function outsideBounds(date: CalendarDate, options: CalendarBehaviorOptions, direction: number): boolean {
  if (direction < 0 && options.min !== undefined) return compareDates(date, options.min) < 0;
  if (direction > 0 && options.max !== undefined) return compareDates(date, options.max) > 0;
  return false;
}

function weekdayOffset(date: CalendarDate, weekStartsOn: number): number {
  return (utcDate(date).getUTCDay() - weekStartsOn + 7) % 7;
}

function weekdayLabel(date: CalendarDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    .format(utcDate(date));
}

function monthLabel(month: CalendarMonth, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(utcDate({ ...month, day: 1 }));
}

function monthOf(date: CalendarDate): CalendarMonth {
  return { year: date.year, month: date.month };
}

function daysInMonth(month: CalendarMonth): number {
  const value = utcDate({ ...addMonths(month, 1), day: 1 });
  value.setUTCDate(0);
  return value.getUTCDate();
}

function epochMilliseconds(date: CalendarDate): number {
  return utcDate(date).getTime();
}

function utcDate(date: CalendarDate): Date {
  assertCalendarDate(date);
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(date.year, date.month - 1, date.day);
  return value;
}

function dateFromUtc(value: Date): CalendarDate {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function assertOptions(options: CalendarBehaviorOptions): void {
  if (options.locale.trim().length === 0) throw new RangeError('date picker locale must not be empty.');
  if (options.min !== undefined) assertCalendarDate(options.min);
  if (options.max !== undefined) assertCalendarDate(options.max);
  if (options.min !== undefined && options.max !== undefined && compareDates(options.min, options.max) > 0) {
    throw new RangeError('date picker min must be before or equal to max.');
  }
  if (
    options.focusSearchLimitDays !== undefined
    && (!Number.isSafeInteger(options.focusSearchLimitDays) || options.focusSearchLimitDays < 0)
  ) {
    throw new RangeError('date picker focusSearchLimitDays must be a non-negative safe integer.');
  }
}

function assertCalendarDate(date: CalendarDate): void {
  adoptCalendarDate(date);
}
