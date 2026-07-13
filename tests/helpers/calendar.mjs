import { calendarPresentation } from '../../dist/behavior/index.js';

export function calendarFixture(options = {}) {
  const visibleMonth = options.visibleMonth ?? { year: 2026, month: 6 };
  return calendarPresentation({
    visibleMonth,
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, {
    locale: options.locale ?? 'en-US',
    weekStartsOn: options.weekStartsOn ?? 1,
    ...(options.today === undefined ? {} : { today: options.today }),
    ...(options.outsideMonth === undefined ? {} : { outsideMonth: options.outsideMonth })
  });
}
