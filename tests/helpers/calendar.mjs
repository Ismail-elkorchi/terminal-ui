import { calendarPresentation } from '../../dist/behavior/index.js';

export function calendarFixture(options = {}) {
  const visibleMonth = options.visibleMonth ?? { year: 2026, month: 6 };
  return calendarPresentation({
    visibleMonth,
    ...(options.selectedDate === undefined ? {} : { selectedDate: options.selectedDate }),
    ...(options.activeDate === undefined ? {} : { activeDate: options.activeDate })
  }, {
    locale: options.locale ?? 'en-US',
    weekStartsOn: options.weekStartsOn ?? 1,
    ...(options.today === undefined ? {} : { today: options.today }),
    ...(options.outsideMonth === undefined ? {} : { outsideMonth: options.outsideMonth })
  });
}
