import type {
  CalendarDate,
  CalendarMonth,
  CalendarAction,
  CalendarDay
} from '../ui-model/calendar.ts';

export interface CalendarState {
  readonly visibleMonth: CalendarMonth;
  readonly selected?: CalendarDate;
  readonly focused?: CalendarDate;
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

export interface CalendarPresentation {
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly selected?: string;
  readonly focused?: string;
}

export function calendarReducer(
  state: CalendarState,
  action: CalendarAction,
  options: CalendarBehaviorOptions
): CalendarState {
  assertOptions(options);
  switch (action.kind) {
    case 'select':
      return selectable(action.date, options)
        ? { ...state, selected: action.date, focused: action.date, visibleMonth: monthOf(action.date) }
        : state;
    case 'focus':
      return selectable(action.date, options)
        ? { ...state, focused: action.date, visibleMonth: monthOf(action.date) }
        : state;
    case 'moveFocus':
      return moveFocus(state, action.days, options);
    case 'moveMonth':
      return moveVisibleMonth(state, action.months, options);
    case 'startOfWeek':
      return moveFocus(state, -weekdayOffset(focusDate(state), options.weekStartsOn), options);
    case 'endOfWeek':
      return moveFocus(state, 6 - weekdayOffset(focusDate(state), options.weekStartsOn), options);
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
  const focusedId = state.focused === undefined ? undefined : calendarDateId(state.focused);
  const representedFocus = focusedId === undefined
    ? undefined
    : days.find((day) => day.id === focusedId && day.disabled !== true)?.id;
  return {
    monthLabel: monthLabel(state.visibleMonth, options.locale),
    weekdays,
    days,
    ...(state.selected === undefined ? {} : { selected: calendarDateId(state.selected) }),
    ...(representedFocus === undefined ? {} : { focused: representedFocus })
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

function moveFocus(
  state: CalendarState,
  days: number,
  options: CalendarBehaviorOptions
): CalendarState {
  const direction = Math.sign(days);
  let candidate = addDays(focusDate(state), days);
  const searchLimit = options.focusSearchLimitDays ?? defaultCalendarFocusSearchLimitDays;
  for (let attempts = 0; attempts <= searchLimit; attempts += 1) {
    if (selectable(candidate, options)) return { ...state, focused: candidate, visibleMonth: monthOf(candidate) };
    if (direction === 0 || outsideBounds(candidate, options, direction)) return withoutCalendarFocus(state);
    candidate = addDays(candidate, direction);
  }
  return withoutCalendarFocus(state);
}

function moveVisibleMonth(
  state: CalendarState,
  months: number,
  options: CalendarBehaviorOptions
): CalendarState {
  const visibleMonth = addMonths(state.visibleMonth, months);
  const day = Math.min(focusDate(state).day, daysInMonth(visibleMonth));
  const candidate = { ...visibleMonth, day };
  const focused = nearestPresentedSelectableDate(visibleMonth, candidate, options);
  const next = withoutCalendarFocus({ ...state, visibleMonth });
  return focused === undefined ? next : { ...next, focused };
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

function withoutCalendarFocus<TState extends CalendarState>(state: TState): Omit<TState, 'focused'> {
  const { focused, ...rest } = state;
  void focused;
  return rest;
}

function focusDate(state: CalendarState): CalendarDate {
  return state.focused ?? state.selected ?? { ...state.visibleMonth, day: 1 };
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
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    throw new RangeError('calendar date fields must be integers.');
  }
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonthUnchecked(date.year, date.month)) {
    throw new RangeError(`invalid calendar date ${String(date.year)}-${String(date.month)}-${String(date.day)}.`);
  }
}

function daysInMonthUnchecked(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
