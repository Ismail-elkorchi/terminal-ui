export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
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

export interface CalendarPresentation {
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly interaction: import('../interaction/collection.ts').CollectionInteractionState;
}

export type CalendarAction =
  | { readonly kind: 'select'; readonly date: CalendarDate }
  | { readonly kind: 'setActive'; readonly date: CalendarDate }
  | { readonly kind: 'moveActive'; readonly days: number }
  | { readonly kind: 'commitActive' }
  | { readonly kind: 'moveMonth'; readonly months: number }
  | { readonly kind: 'startOfWeek' }
  | { readonly kind: 'endOfWeek' };
