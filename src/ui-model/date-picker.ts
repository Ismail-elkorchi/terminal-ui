export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export interface DatePickerDay {
  readonly id: string;
  readonly label: string;
  readonly date: CalendarDate;
  readonly disabled?: boolean;
  readonly today?: boolean;
  readonly outsideMonth?: boolean;
  readonly hidden?: boolean;
}

export type DatePickerAction =
  | { readonly kind: 'select'; readonly date: CalendarDate }
  | { readonly kind: 'focus'; readonly date: CalendarDate }
  | { readonly kind: 'moveFocus'; readonly days: number }
  | { readonly kind: 'moveMonth'; readonly months: number }
  | { readonly kind: 'startOfWeek' }
  | { readonly kind: 'endOfWeek' };
