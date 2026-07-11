import { datePickerPresentation } from '../../dist/behavior/index.js';

export function datePickerFixture(options = {}) {
  const visibleMonth = options.visibleMonth ?? { year: 2026, month: 6 };
  return datePickerPresentation({
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
