import type {
  ColorSwatchPickerOption
} from '../../../../ui-model/forms.ts';
import type { CalendarDate, CalendarDay } from '../../../../ui-model/calendar.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { RenderSpan, TerminalStyle } from '../../frame.ts';
import {
  formLabelStyle,
  formMarkerStyle,
  formSpan,
  optionControlState,
  separatorSpan
} from '../../form-visual.ts';
import { renderNodeStyle, resolveRenderNodeStyle } from '../../render-node-style.ts';
import { selectedId } from './choices.ts';
import {
  clean,
  clip,
  clipNoEllipsis,
  finiteNumber,
  isRecord
} from './shared.ts';

type ColorSwatchPickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'colorSwatchPicker'>;
type CalendarNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'calendar'>;
type PickerNode<TMessage = unknown> = ColorSwatchPickerNode<TMessage> | CalendarNode<TMessage>;

export function pickerMessageFactory<TMessage>(
  widget: PickerNode<TMessage>
): ((option: ColorSwatchPickerOption<unknown> | CalendarDay) => TMessage) | undefined {
  if (widget.kind === 'colorSwatchPicker') {
    const toMessage = widget.props.toActionMessage;
    return toMessage === undefined ? undefined : (option) => toMessage({ kind: 'select', id: option.id });
  }
  const toMessage = widget.props.toMessage;
  return toMessage === undefined ? undefined : (option) => toMessage(option as CalendarDay);
}

export function colorOptions(widget: ColorSwatchPickerNode): readonly ColorSwatchPickerOption<unknown>[] {
  return widget.props.options.flatMap(
    (option): readonly ColorSwatchPickerOption<unknown>[] => sanitizeColorOption(option)
  );
}

export function selectedColorOption(widget: ColorSwatchPickerNode): ColorSwatchPickerOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : colorOptions(widget).find((option) => option.id === selected);
}

export function calendarDays(widget: CalendarNode): readonly CalendarDay[] {
  return widget.props.days.flatMap((day): readonly CalendarDay[] => sanitizeCalendarDay(day));
}

export function selectedCalendarDay(widget: CalendarNode): CalendarDay | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : calendarDays(widget).find((day) => day.id === selected);
}

export function pickerColumns(widget: PickerNode, fallback: number): number {
  return widget.kind === 'calendar'
    ? 7
    : Math.max(1, Math.floor(finiteNumber(widget.props.columns, fallback)));
}

export function pickerCellWidth(widget: PickerNode): number {
  return widget.kind === 'calendar' ? 4 : 12;
}

export function pickerOptionRowOffset(widget: PickerNode, columns: number): number {
  let offset = clean(widget.props.label ?? '').length > 0 ? 1 : 0;
  if (widget.kind === 'colorSwatchPicker' && selectedColorOption(widget) !== undefined) offset += 1;
  if (widget.kind === 'calendar' && columns === 7) offset += 2;
  return offset;
}

export function calendarMonthHeaderSpans(widget: CalendarNode): readonly RenderSpan[] {
  const label = clean(widget.props.monthLabel);
  if (widget.props.toActionMessage === undefined || widget.props.disabled === true) {
    return [formSpan(widget, 'title', 'month.label', label, formLabelStyle(widget))];
  }
  return [
    formSpan(widget, 'marker', 'month.previous', '[‹]', formMarkerStyle(widget)),
    separatorSpan(widget),
    formSpan(widget, 'title', 'month.label', label, formLabelStyle(widget)),
    separatorSpan(widget),
    formSpan(widget, 'marker', 'month.next', '[›]', formMarkerStyle(widget))
  ];
}

export function colorSwatchPickerSummarySpans(
  option: ColorSwatchPickerOption<unknown>,
  widget: ColorSwatchPickerNode
): readonly RenderSpan[] {
  const disabled = option.disabled === true || widget.props.disabled === true;
  const style = disabled
    ? renderNodeStyle(widget, 'summary', 'disabled')
    : option.style ?? colorSwatchStyle(widget);
  return [
    formSpan(widget, 'summary', 'summary.label', 'Selected', formLabelStyle(widget, disabled ? 'disabled' : undefined)),
    formSpan(widget, 'separator', 'summary.separator', ': '),
    formSpan(widget, 'swatch', 'summary.swatch', option.swatch ?? '■', style),
    separatorSpan(widget),
    formSpan(widget, 'summary', 'summary.value', option.label, style)
  ];
}

export function colorSwatchPickerSpans(
  option: ColorSwatchPickerOption<unknown>,
  widget: ColorSwatchPickerNode
): readonly RenderSpan[] {
  const selected = option.id === selectedId(widget);
  const disabled = option.disabled === true || widget.props.disabled === true;
  const label = clip(option.label, 8).padEnd(8, ' ');
  const state = optionControlState(widget, { selected, disabled });
  const style = disabled
    ? renderNodeStyle(widget, 'option', 'disabled')
    : option.style ?? colorOptionStyle(option, widget) ?? colorSwatchStyle(widget);
  return [
    formSpan(widget, 'marker', `option.${option.id}.open`, selected ? '[' : ' ', formMarkerStyle(widget, state)),
    formSpan(widget, 'swatch', `option.${option.id}.swatch`, option.swatch ?? '■', style),
    separatorSpan(widget),
    formSpan(widget, 'option', `option.${option.id}.label`, label, style),
    formSpan(widget, 'marker', `option.${option.id}.close`, selected ? ']' : ' ', formMarkerStyle(widget, state)),
    separatorSpan(widget)
  ];
}

export function calendarWeekdayHeaderSpans(widget: CalendarNode): readonly RenderSpan[] {
  return widget.props.weekdays.slice(0, 7).map((label, index) =>
    formSpan(widget, 'weekday', `weekday.${String(index)}`, ` ${clipNoEllipsis(clean(label), 2).padEnd(2, ' ')} `, formLabelStyle(widget, 'disabled'))
  );
}

export function calendarCellSpans(
  day: CalendarDay,
  widget: CalendarNode
): readonly RenderSpan[] {
  const label = clipNoEllipsis(day.label, 2).padStart(2, ' ');
  const selected = day.id === selectedId(widget);
  const state = calendarDayState(day, widget);
  if (selected) {
    return [
      formSpan(widget, 'marker', `day.${day.id}.open`, '[', formMarkerStyle(widget, state)),
      formSpan(widget, 'day', `day.${day.id}.label`, label, calendarDayStyle(day, widget)),
      formSpan(widget, 'marker', `day.${day.id}.close`, ']', formMarkerStyle(widget, state))
    ];
  }
  if (day.today === true) {
    return [
      formSpan(widget, 'marker', `day.${day.id}.today`, '*', formMarkerStyle(widget, state)),
      formSpan(widget, 'day', `day.${day.id}.label`, label, calendarDayStyle(day, widget)),
      separatorSpan(widget)
    ];
  }
  return [
    separatorSpan(widget),
    formSpan(widget, 'day', `day.${day.id}.label`, label, calendarDayStyle(day, widget)),
    separatorSpan(widget)
  ];
}

function sanitizeColorOption(value: unknown): readonly ColorSwatchPickerOption<unknown>[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  const description = value['description'];
  const swatch = value['swatch'];
  return [{
    id: clean(id),
    label: clean(label),
    value: value['value'],
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(typeof description === 'string' ? { description: clean(description) } : {}),
    ...(typeof swatch === 'string' ? { swatch: clean(swatch) } : {}),
    ...(isRecord(value['style']) ? { style: value['style'] } : {})
  }];
}

function sanitizeCalendarDay(value: unknown): readonly CalendarDay[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  const date = sanitizeCalendarDate(value['date']);
  if (typeof id !== 'string' || typeof label !== 'string' || date === undefined) return [];
  return [{
    id: clean(id),
    label: clean(label),
    date,
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(value['today'] === true ? { today: true } : {}),
    ...(value['outsideMonth'] === true ? { outsideMonth: true } : {}),
    ...(value['hidden'] === true ? { hidden: true } : {})
  }];
}

function colorSwatchStyle(widget: ColorSwatchPickerNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    part: 'swatch',
    base: {
      fg: { kind: 'theme', token: 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.primary.background' }
    }
  });
}

function colorOptionStyle(
  option: ColorSwatchPickerOption<unknown>,
  widget: ColorSwatchPickerNode
): TerminalStyle | undefined {
  if (option.disabled === true || widget.props.disabled === true) {
    return renderNodeStyle(widget, 'option', 'disabled');
  }
  return renderNodeStyle(widget, 'option', option.id === selectedId(widget) ? 'selected' : undefined);
}

function calendarDayStyle(
  day: CalendarDay,
  widget: CalendarNode
): TerminalStyle | undefined {
  if (day.disabled === true || widget.props.disabled === true) {
    return renderNodeStyle(widget, 'option', 'disabled');
  }
  if (day.id === selectedId(widget)) return renderNodeStyle(widget, 'option', 'selected');
  if (day.id === widget.props.focused) return renderNodeStyle(widget, 'option', 'focused');
  if (day.today === true) return renderNodeStyle(widget, 'option', 'focused');
  return renderNodeStyle(widget, 'option', day.outsideMonth === true ? 'disabled' : undefined);
}

function calendarDayState(
  day: CalendarDay,
  widget: CalendarNode
): 'selected' | 'disabled' | 'focused' | undefined {
  if (day.disabled === true || widget.props.disabled === true) return 'disabled';
  if (day.id === selectedId(widget)) return 'selected';
  if (day.id === widget.props.focused) return 'focused';
  return day.today === true ? 'focused' : undefined;
}

function sanitizeCalendarDate(value: unknown): CalendarDate | undefined {
  if (!isRecord(value)) return undefined;
  const year = value['year'];
  const month = value['month'];
  const day = value['day'];
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    ? { year: year as number, month: month as number, day: day as number }
    : undefined;
}
