import { defineComponent, ignoreMessage } from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  HitTarget,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { CollectionInteractionState } from '../../interaction/collection-interaction.ts';
import { clipTextCells, measureTextCells, padTextCells } from '../../text/index.ts';
import type { CalendarTransition, CalendarDay } from '../../behavior/calendar.ts';
import { decodeCalendarDate } from '../../behavior/calendar.ts';
import type { CalendarStylePart } from '../style-parts.ts';
import type { RenderSpan } from '../../visual/render-content.ts';
import type { CalendarOptions } from '../options/forms.ts';
import { assertTransitionCallback } from './form-control-helpers.ts';
import {
  assertUnique,
  cleanString,
  controlSpan,
  errorLines,
  measureLines,
  optionalBoolean,
  optionalString,
  paintLines,
} from './input-control-helpers.ts';
import { decodeChoiceState, isChoiceSelected } from './choice-control-helpers.ts';

interface CalendarModel {
  readonly label: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDayModel[];
  readonly interaction: CollectionInteractionState;
  readonly error: string;
}

interface CalendarDayModel extends CalendarDay {
  readonly disabled: boolean;
  readonly hidden: boolean;
}

type CalendarFactory = <const TMessage extends ComponentMessage = never>(
  options: CalendarOptions<TMessage>,
) => Element<TMessage>;

const instantiateCalendar = defineComponent<
  Omit<CalendarOptions<ComponentMessage>, 'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'>,
  CalendarModel,
  CalendarTransition,
  CalendarStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'selected', 'disabled']
>({
  name: 'terminal-ui/components/calendar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'grid',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'option', 'month', 'weekday', 'error'],
  visualStates: ['focused', 'selected', 'disabled'],
  createModel: createCalendarModel,
  measure: (input) => measureLines(calendarLines(input, false), input),
  render: (input) => {
    paintLines(input, calendarLines(input, true));
  },
  keys: ({ model }) => ({
    arrowLeft: () => ({ kind: 'moveActive', days: -1 }),
    arrowRight: () => ({ kind: 'moveActive', days: 1 }),
    arrowUp: () => ({ kind: 'moveActive', days: -7 }),
    arrowDown: () => ({ kind: 'moveActive', days: 7 }),
    pageUp: () => ({ kind: 'moveMonth', months: -1 }),
    pageDown: () => ({ kind: 'moveMonth', months: 1 }),
    home: () => ({ kind: 'startOfWeek' }),
    end: () => ({ kind: 'endOfWeek' }),
    ...(activeDay(model) === undefined ? {} : {
      enter: () => ({ kind: 'commitActive' as const }),
    }),
  }),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: calendarHitTargets,
  accessibility({ id, model, focused, disabled }) {
    const days = model.days.filter((day) => !day.hidden);
    const rowCount = Math.ceil(days.length / 7);
    return {
      id,
      role: 'grid',
      label: model.label || model.monthLabel,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
      ...(focused ? { focused: true } : {}),
      ...(model.interaction.activeId === undefined
        ? {}
        : { activeDescendant: `${id}:${model.interaction.activeId}` }),
      ...(rowCount === 0 ? {} : { position: { rowCount, columnCount: 7 } }),
      children: [...Array.from({ length: rowCount }, (_, rowIndex) => ({
        id: `${id}:week:${String(rowIndex + 1)}`,
        role: 'row' as const,
        position: { rowIndex: rowIndex + 1, rowCount, columnCount: 7 },
        children: days.slice(rowIndex * 7, (rowIndex + 1) * 7).map((day, columnIndex) => ({
          id: `${id}:${day.id}`,
          role: 'gridcell' as const,
          label: day.label,
          selected: isChoiceSelected(model.interaction.selection, day.id),
          ...(day.id === model.interaction.activeId ? { current: true } : {}),
          position: { rowIndex: rowIndex + 1, columnIndex: columnIndex + 1, columnCount: 7 },
          ...(disabled || day.disabled ? { disabled: true } : {}),
        })),
      })), ...(model.error === '' ? [] : [{
        id: `${id}:error-row`,
        role: 'row' as const,
        children: [{ id: `${id}:error`, role: 'gridcell' as const, label: model.error }],
      }])],
    };
  },
});

export const calendar: CalendarFactory = (options) => {
  if (options.disabled === true) {
    return instantiateCalendar(options);
  }
  assertTransitionCallback(options, 'calendar');
  const { onTransition, ...rest } = options;
  return instantiateCalendar({
    ...rest,
    onAction: (action) => {
      if (action.kind === 'setActive') return ignoreMessage();
      return onTransition(action);
    },
  });
};

function createCalendarModel(
  value: Readonly<Omit<CalendarOptions<ComponentMessage>, 'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'>>,
): CalendarModel {
  if (!isNonArrayObject(value.view)
    || !Array.isArray(value.view.weekdays)
    || !Array.isArray(value.view.days)) {
    throw new TypeError('calendar options are invalid.');
  }
  if (value.view.weekdays.length !== 7) {
    throw new RangeError('calendar weekdays must contain seven labels.');
  }
  const weekdays = value.view.weekdays.map((day, index) =>
    cleanString(day, `calendar weekdays[${String(index)}]`)
  );
  const days = value.view.days.map((day, index): CalendarDayModel => {
    if (!isNonArrayObject(day) || !isNonArrayObject(day['date'])) {
      throw new TypeError(`calendar days[${String(index)}] is invalid.`);
    }
    const date = decodeCalendarDate(day['date'], `calendar days[${String(index)}] date`);
    return {
      id: cleanString(day['id'], 'calendar day id'),
      label: cleanString(day['label'], 'calendar day label'),
      date,
      disabled: optionalBoolean(day['disabled'], 'calendar day disabled') ?? false,
      hidden: optionalBoolean(day['hidden'], 'calendar day hidden') ?? false,
      ...(day['today'] === true ? { today: true } : {}),
      ...(day['outsideMonth'] === true ? { outsideMonth: true } : {}),
    };
  });
  assertUnique(days, 'calendar');
  const interaction = decodeChoiceState(
    value.view.interaction,
    'single',
    'calendar',
    days.map((day) => day.id),
  );
  return {
    label: cleanString(value.label, 'calendar label'),
    monthLabel: cleanString(value.view.monthLabel, 'calendar monthLabel'),
    weekdays,
    days,
    interaction,
    error: optionalString(value.error, 'calendar error') ?? '',
  };
}

function calendarLines(
  input:
    | ComponentMeasureInput<CalendarModel>
    | ComponentRenderInput<CalendarModel, CalendarStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const days = input.model.days.filter((day) => !day.hidden);
  const month = input.disabled
    ? [controlSpan(input, input.model.monthLabel, 'month', 'month.label', decorated)]
    : [
      controlSpan(input, ' ‹ ', 'option', 'month.previous', decorated, undefined, 'decoration'),
      controlSpan(input, ' ', 'option', 'month.previous.gap', decorated, undefined, 'separator'),
      controlSpan(input, input.model.monthLabel, 'month', 'month.label', decorated),
      controlSpan(input, ' ', 'option', 'month.next.gap', decorated, undefined, 'separator'),
      controlSpan(input, ' › ', 'option', 'month.next', decorated, undefined, 'decoration'),
    ];
  const weekdays = input.model.weekdays.flatMap((day, index) => [controlSpan(
    input,
    ` ${
      padTextCells(clipTextCells(day, 2, { widthProfile: input.widthProfile }).text, 2, {
        widthProfile: input.widthProfile,
      })
    } `,
    'weekday',
    `weekday.${String(index)}`,
    decorated,
    { fg: { kind: 'theme', token: 'text.disabled' }, dim: true },
  )]);
  const rows = Array.from(
    { length: Math.ceil(days.length / 7) },
    (_unused, row) =>
      days.slice(row * 7, (row + 1) * 7).flatMap((day) => calendarDaySpans(input, day, decorated)),
  );
  return [
    ...(input.model.label === ''
      ? []
      : [[controlSpan(input, input.model.label, 'label', 'label', decorated)]]),
    month,
    weekdays,
    ...rows,
    ...errorLines(input, input.model.error, 'error', decorated),
  ];
}

function calendarDaySpans(
  input:
    | ComponentMeasureInput<CalendarModel>
    | ComponentRenderInput<CalendarModel, CalendarStylePart>,
  day: CalendarDayModel,
  decorated: boolean,
): readonly RenderSpan[] {
  const selected = isChoiceSelected(input.model.interaction.selection, day.id);
  const states = input.disabled || day.disabled || day.outsideMonth === true
    ? ['disabled' as const]
    : [
      ...(selected ? ['selected' as const] : []),
      ...(day.id === input.model.interaction.activeId ? ['focused' as const] : []),
    ];
  const label = padTextCells(
    clipTextCells(day.label, 2, { widthProfile: input.widthProfile }).text,
    2,
    { align: 'end', widthProfile: input.widthProfile },
  );
  const open = selected ? '[' : day.today === true ? '*' : ' ';
  const close = selected ? ']' : ' ';
  return [
    controlSpan(
      input,
      open,
      'option',
      `day.${day.id}.${selected ? 'open' : day.today === true ? 'today' : 'leading'}`,
      decorated,
      undefined,
      'decoration',
      states,
    ),
    controlSpan(input, label, 'option', `day.${day.id}.label`, decorated, undefined, 'text', states),
    controlSpan(
      input,
      close,
      'option',
      `day.${day.id}.${selected ? 'close' : 'trailing'}`,
      decorated,
      undefined,
      'decoration',
      states,
    ),
  ];
}

function activeDay(model: CalendarModel): CalendarDayModel | undefined {
  return model.days.find((day) =>
    day.id === model.interaction.activeId && !day.disabled && !day.hidden
  );
}

function calendarHitTargets(
  input: ComponentInput<CalendarModel>,
): readonly HitTarget<CalendarTransition>[] {
  let visible = 0;
  const monthRow = input.model.label === '' ? 0 : 1;
  const monthLabelWidth =
    measureTextCells(input.model.monthLabel, { widthProfile: input.widthProfile }).cells;
  const previousWidth = Math.min(3, input.bounds.width);
  const nextColumn = Math.min(Math.max(0, input.bounds.width - 3), 4 + monthLabelWidth);
  const nextWidth = Math.min(3, Math.max(0, input.bounds.width - nextColumn));
  const navigation = input.disabled || input.bounds.height <= monthRow ? [] : [
    {
      id: `${input.id ?? 'calendar'}:month:previous`,
      bounds: { row: monthRow, column: 0, width: previousWidth, height: 1 },
      cursor: 'pointer' as const,
      message: () => ({ kind: 'moveMonth' as const, months: -1 as const }),
    },
    ...(nextWidth === 0 ? [] : [{
      id: `${input.id ?? 'calendar'}:month:next`,
      bounds: { row: monthRow, column: nextColumn, width: nextWidth, height: 1 },
      cursor: 'pointer' as const,
      message: () => ({ kind: 'moveMonth' as const, months: 1 as const }),
    }]),
  ];
  const dayRowOffset = monthRow + 2;
  const days = input.model.days.flatMap((day) => {
    if (day.hidden) return [];
    const index = visible++;
    const column = (index % 7) * 4;
    return day.disabled || column >= input.bounds.width ? [] : [{
      id: `${input.id ?? 'calendar'}:${day.id}`,
      bounds: {
        row: dayRowOffset + Math.floor(index / 7),
        column,
        width: Math.min(4, input.bounds.width - column),
        height: 1,
      },
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: () => ({ kind: 'select' as const, date: day.date }),
    }];
  });
  return [...navigation, ...days];
}
