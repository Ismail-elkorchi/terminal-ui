import type {
  ColorPickerOption,
  DatePickerDay
} from '../../../components/options/forms.ts';
import type { RenderNodeOfKind } from '../../../render-node/index.ts';
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

type ColorPickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'colorPicker'>;
type DatePickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'datePicker'>;
type PickerNode<TMessage = unknown> = ColorPickerNode<TMessage> | DatePickerNode<TMessage>;

export function pickerMessageFactory<TMessage>(
  widget: PickerNode<TMessage>
): ((option: ColorPickerOption<unknown> | DatePickerDay<unknown>) => TMessage) | undefined {
  if (widget.kind === 'colorPicker') {
    const toMessage = widget.props.toMessage;
    return toMessage === undefined ? undefined : (option) => toMessage(option);
  }
  const toMessage = widget.props.toMessage;
  return toMessage === undefined ? undefined : (option) => toMessage(option);
}

export function colorOptions(widget: ColorPickerNode): readonly ColorPickerOption<unknown>[] {
  return widget.props.options.flatMap(
    (option): readonly ColorPickerOption<unknown>[] => sanitizeColorOption(option)
  );
}

export function selectedColorOption(widget: ColorPickerNode): ColorPickerOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : colorOptions(widget).find((option) => option.id === selected);
}

export function datePickerDays(widget: DatePickerNode): readonly DatePickerDay<unknown>[] {
  return widget.props.days.flatMap((day): readonly DatePickerDay<unknown>[] => sanitizeDatePickerDay(day));
}

export function selectedDatePickerDay(widget: DatePickerNode): DatePickerDay<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : datePickerDays(widget).find((day) => day.id === selected);
}

export function pickerColumns(widget: PickerNode, fallback: number): number {
  return Math.max(1, Math.floor(finiteNumber(widget.props.columns, fallback)));
}

export function pickerCellWidth(widget: PickerNode): number {
  return widget.kind === 'datePicker' ? 4 : 12;
}

export function pickerOptionRowOffset(widget: PickerNode, columns: number): number {
  let offset = clean(widget.props.label ?? '').length > 0 ? 1 : 0;
  if (widget.kind === 'colorPicker' && selectedColorOption(widget) !== undefined) offset += 1;
  if (widget.kind === 'datePicker' && columns === 7) offset += 1;
  return offset;
}

export function colorPickerSummarySpans(
  option: ColorPickerOption<unknown>,
  widget: ColorPickerNode
): readonly RenderSpan[] {
  const disabled = option.disabled === true || widget.props.disabled === true;
  const style = disabled
    ? renderNodeStyle(widget, 'value', 'disabled')
    : option.style ?? colorSwatchStyle(widget);
  return [
    formSpan(widget, 'summary', 'summary.label', 'Selected', formLabelStyle(widget, disabled ? 'disabled' : undefined)),
    formSpan(widget, 'separator', 'summary.separator', ': '),
    formSpan(widget, 'swatch', 'summary.swatch', option.swatch ?? '■', style),
    separatorSpan(widget),
    formSpan(widget, 'summary', 'summary.value', option.label, style)
  ];
}

export function colorPickerSpans(
  option: ColorPickerOption<unknown>,
  widget: ColorPickerNode
): readonly RenderSpan[] {
  const selected = option.id === selectedId(widget);
  const disabled = option.disabled === true || widget.props.disabled === true;
  const label = clip(option.label, 8).padEnd(8, ' ');
  const state = optionControlState(widget, { selected, disabled });
  const style = disabled
    ? renderNodeStyle(widget, 'value', 'disabled')
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

export function datePickerWeekdayHeaderSpans(widget: DatePickerNode): readonly RenderSpan[] {
  return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) =>
    formSpan(widget, 'weekday', `weekday.${label.toLowerCase()}`, ` ${label} `, formLabelStyle(widget, 'disabled'))
  );
}

export function datePickerCellSpans(
  day: DatePickerDay<unknown>,
  widget: DatePickerNode
): readonly RenderSpan[] {
  const label = clipNoEllipsis(day.label, 2).padStart(2, ' ');
  const selected = day.id === selectedId(widget);
  const state = datePickerDayState(day, widget);
  if (selected) {
    return [
      formSpan(widget, 'marker', `day.${day.id}.open`, '[', formMarkerStyle(widget, state)),
      formSpan(widget, 'day', `day.${day.id}.label`, label, datePickerDayStyle(day, widget)),
      formSpan(widget, 'marker', `day.${day.id}.close`, ']', formMarkerStyle(widget, state))
    ];
  }
  if (day.today === true) {
    return [
      formSpan(widget, 'marker', `day.${day.id}.today`, '*', formMarkerStyle(widget, state)),
      formSpan(widget, 'day', `day.${day.id}.label`, label, datePickerDayStyle(day, widget)),
      separatorSpan(widget)
    ];
  }
  return [
    separatorSpan(widget),
    formSpan(widget, 'day', `day.${day.id}.label`, label, datePickerDayStyle(day, widget)),
    separatorSpan(widget)
  ];
}

function sanitizeColorOption(value: unknown): readonly ColorPickerOption<unknown>[] {
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

function sanitizeDatePickerDay(value: unknown): readonly DatePickerDay<unknown>[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  return [{
    id: clean(id),
    label: clean(label),
    value: value['value'],
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(value['today'] === true ? { today: true } : {}),
    ...(value['outsideMonth'] === true ? { outsideMonth: true } : {})
  }];
}

function colorSwatchStyle(widget: ColorPickerNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    base: {
      fg: { kind: 'theme', token: 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.primary.background' }
    }
  });
}

function colorOptionStyle(
  option: ColorPickerOption<unknown>,
  widget: ColorPickerNode
): TerminalStyle | undefined {
  if (option.disabled === true || widget.props.disabled === true) {
    return renderNodeStyle(widget, 'value', 'disabled');
  }
  if (option.id === selectedId(widget)) return renderNodeStyle(widget, 'value', 'selected');
  return undefined;
}

function datePickerDayStyle(
  day: DatePickerDay<unknown>,
  widget: DatePickerNode
): TerminalStyle | undefined {
  if (day.disabled === true || widget.props.disabled === true) {
    return renderNodeStyle(widget, 'value', 'disabled');
  }
  if (day.id === selectedId(widget)) return renderNodeStyle(widget, 'value', 'selected');
  if (day.today === true) return renderNodeStyle(widget, 'value', 'focused');
  if (day.outsideMonth === true) return renderNodeStyle(widget, 'value', 'disabled');
  return undefined;
}

function datePickerDayState(
  day: DatePickerDay<unknown>,
  widget: DatePickerNode
): 'selected' | 'disabled' | 'focused' | undefined {
  if (day.disabled === true || widget.props.disabled === true || day.outsideMonth === true) return 'disabled';
  if (day.id === selectedId(widget)) return 'selected';
  return day.today === true ? 'focused' : undefined;
}
