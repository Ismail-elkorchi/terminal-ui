export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function decodeCalendarDate(value: unknown, subject = 'calendar date'): CalendarDate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  const date = value as Readonly<Record<string, unknown>>;
  const year = date['year'];
  const month = date['month'];
  const day = date['day'];
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError(`${subject} fields must be integers.`);
  }
  const typedYear = year as number;
  const typedMonth = month as number;
  const typedDay = day as number;
  if (
    typedMonth < 1
    || typedMonth > 12
    || typedDay < 1
    || typedDay > daysInCalendarMonth(typedYear, typedMonth)
  ) {
    throw new RangeError(
      `invalid ${subject} ${String(typedYear)}-${String(typedMonth)}-${String(typedDay)}.`,
    );
  }
  return Object.freeze({ year: typedYear, month: typedMonth, day: typedDay });
}

function daysInCalendarMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export interface CalendarDay {
  readonly id: string;
  readonly label: string;
  readonly date: CalendarDate;
  readonly disabled?: boolean;
  readonly today?: boolean;
  readonly outsideMonth?: boolean;
  readonly hidden?: boolean;
}

export interface CalendarView {
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly interaction: import('../interaction/collection-interaction.ts').CollectionInteractionState;
}

export type CalendarTransition =
  | { readonly kind: 'select'; readonly date: CalendarDate }
  | { readonly kind: 'setActive'; readonly date: CalendarDate }
  | { readonly kind: 'moveActive'; readonly days: number }
  | { readonly kind: 'commitActive' }
  | { readonly kind: 'moveMonth'; readonly months: number }
  | { readonly kind: 'startOfWeek' }
  | { readonly kind: 'endOfWeek' };

export type CalendarControlTransition = Exclude<CalendarTransition, { readonly kind: 'setActive' }>;
