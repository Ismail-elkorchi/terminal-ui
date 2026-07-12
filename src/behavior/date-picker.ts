import type {
  CalendarDate,
  CalendarMonth,
  DatePickerAction,
  DatePickerDay
} from '../ui-model/date-picker.ts';

export interface DatePickerState {
  readonly visibleMonth: CalendarMonth;
  readonly selected?: CalendarDate;
  readonly focused?: CalendarDate;
}

export interface DatePickerBehaviorOptions {
  readonly locale: string;
  readonly weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly min?: CalendarDate;
  readonly max?: CalendarDate;
  readonly today?: CalendarDate;
  readonly outsideMonth?: 'hidden' | 'visible' | 'selectable';
  isDisabled?(date: CalendarDate): boolean;
}

export interface DatePickerPresentation {
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly DatePickerDay[];
  readonly selected?: string;
  readonly focused?: string;
}

export function datePickerReducer(
  state: DatePickerState,
  action: DatePickerAction,
  options: DatePickerBehaviorOptions
): DatePickerState {
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

export function datePickerPresentation(
  state: DatePickerState,
  options: DatePickerBehaviorOptions
): DatePickerPresentation {
  assertOptions(options);
  const first = { ...state.visibleMonth, day: 1 };
  assertCalendarDate(first);
  const start = addDays(first, -weekdayOffset(first, options.weekStartsOn));
  const weekdays = Array.from({ length: 7 }, (_value, index) => weekdayLabel(addDays(start, index), options.locale));
  const outsidePolicy = options.outsideMonth ?? 'visible';
  const days = Array.from({ length: 42 }, (_value, index): DatePickerDay => {
    const date = addDays(start, index);
    const outsideMonth = date.year !== state.visibleMonth.year || date.month !== state.visibleMonth.month;
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
  return {
    monthLabel: monthLabel(state.visibleMonth, options.locale),
    weekdays,
    days,
    ...(state.selected === undefined ? {} : { selected: calendarDateId(state.selected) }),
    ...(state.focused === undefined ? {} : { focused: calendarDateId(state.focused) })
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
  state: DatePickerState,
  days: number,
  options: DatePickerBehaviorOptions
): DatePickerState {
  const direction = Math.sign(days);
  let candidate = addDays(focusDate(state), days);
  for (let attempts = 0; attempts < 3660; attempts += 1) {
    if (selectable(candidate, options)) return { ...state, focused: candidate, visibleMonth: monthOf(candidate) };
    if (direction === 0 || outsideBounds(candidate, options, direction)) return state;
    candidate = addDays(candidate, direction);
  }
  return state;
}

function moveVisibleMonth(
  state: DatePickerState,
  months: number,
  options: DatePickerBehaviorOptions
): DatePickerState {
  const visibleMonth = addMonths(state.visibleMonth, months);
  const day = Math.min(focusDate(state).day, daysInMonth(visibleMonth));
  const candidate = { ...visibleMonth, day };
  const focused = selectable(candidate, options) ? candidate : state.focused;
  return { ...state, visibleMonth, ...(focused === undefined ? {} : { focused }) };
}

function focusDate(state: DatePickerState): CalendarDate {
  return state.focused ?? state.selected ?? { ...state.visibleMonth, day: 1 };
}

function selectable(date: CalendarDate, options: DatePickerBehaviorOptions): boolean {
  assertCalendarDate(date);
  if (options.min !== undefined && compareDates(date, options.min) < 0) return false;
  if (options.max !== undefined && compareDates(date, options.max) > 0) return false;
  return options.isDisabled?.(date) !== true;
}

function outsideBounds(date: CalendarDate, options: DatePickerBehaviorOptions, direction: number): boolean {
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

function assertOptions(options: DatePickerBehaviorOptions): void {
  if (options.locale.trim().length === 0) throw new RangeError('date picker locale must not be empty.');
  if (options.min !== undefined) assertCalendarDate(options.min);
  if (options.max !== undefined) assertCalendarDate(options.max);
  if (options.min !== undefined && options.max !== undefined && compareDates(options.min, options.max) > 0) {
    throw new RangeError('date picker min must be before or equal to max.');
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
