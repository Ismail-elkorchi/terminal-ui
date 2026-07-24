import type {
  ColorSwatchPickerOption
} from '../../../../ui-model/forms.ts';
import type { CalendarDate, CalendarDay } from '../../../../ui-model/calendar.ts';
import { oneCellGlyph, padTextCells } from '../../../../text/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';
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
  renderNode: PickerNode<TMessage>
): ((option: ColorSwatchPickerOption<unknown> | CalendarDay) => TMessage) | undefined {
  if (renderNode.kind === 'colorSwatchPicker') {
    const toMessage = renderNode.props.toActionMessage;
    return toMessage === undefined ? undefined : (option) => toMessage({ kind: 'select', id: option.id });
  }
  const toMessage = renderNode.props.toMessage;
  return toMessage === undefined ? undefined : (option) => toMessage(option as CalendarDay);
}

export function colorOptions(renderNode: ColorSwatchPickerNode): readonly ColorSwatchPickerOption<unknown>[] {
  return renderNode.props.options.flatMap(
    (option): readonly ColorSwatchPickerOption<unknown>[] => sanitizeColorOption(option)
  );
}

export function selectedColorOption(renderNode: ColorSwatchPickerNode): ColorSwatchPickerOption<unknown> | undefined {
  const selected = selectedId(renderNode);
  return selected === undefined ? undefined : colorOptions(renderNode).find((option) => option.id === selected);
}

export function calendarDays(renderNode: CalendarNode): readonly CalendarDay[] {
  return renderNode.props.days.flatMap((day): readonly CalendarDay[] => sanitizeCalendarDay(day));
}

export function selectedCalendarDay(renderNode: CalendarNode): CalendarDay | undefined {
  const selected = selectedId(renderNode);
  return selected === undefined ? undefined : calendarDays(renderNode).find((day) => day.id === selected);
}

export function pickerColumns(renderNode: PickerNode, fallback: number): number {
  return renderNode.kind === 'calendar'
    ? 7
    : Math.max(1, Math.floor(finiteNumber(renderNode.props.columns, fallback)));
}

export function pickerCellWidth(renderNode: PickerNode): number {
  return renderNode.kind === 'calendar' ? 4 : 12;
}

export function pickerOptionRowOffset(renderNode: PickerNode, columns: number): number {
  let offset = clean(renderNode.props.label ?? '').length > 0 ? 1 : 0;
  if (renderNode.kind === 'colorSwatchPicker' && selectedColorOption(renderNode) !== undefined) offset += 1;
  if (renderNode.kind === 'calendar' && columns === 7) offset += 2;
  return offset;
}

export function calendarMonthHeaderSpans(renderNode: CalendarNode): readonly RenderSpan[] {
  const label = clean(renderNode.props.monthLabel);
  if (renderNode.props.toActionMessage === undefined || renderNode.props.disabled === true) {
    return [formSpan(renderNode, 'title', 'month.label', label, formLabelStyle(renderNode))];
  }
  return [
    formSpan(renderNode, 'marker', 'month.previous', '[‹]', formMarkerStyle(renderNode)),
    separatorSpan(renderNode),
    formSpan(renderNode, 'title', 'month.label', label, formLabelStyle(renderNode)),
    separatorSpan(renderNode),
    formSpan(renderNode, 'marker', 'month.next', '[›]', formMarkerStyle(renderNode))
  ];
}

export function colorSwatchPickerSummarySpans(
  option: ColorSwatchPickerOption<unknown>,
  renderNode: ColorSwatchPickerNode,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const disabled = option.disabled === true || renderNode.props.disabled === true;
  const style = disabled
    ? renderNodeStyle(renderNode, 'summary', 'disabled')
    : option.style ?? colorSwatchStyle(renderNode);
  return [
    formSpan(renderNode, 'summary', 'summary.label', 'Selected', formLabelStyle(renderNode, disabled ? 'disabled' : undefined)),
    formSpan(renderNode, 'separator', 'summary.separator', ': '),
    formSpan(renderNode, 'swatch', 'summary.swatch', oneCellGlyph(option.swatch ?? '■', '*', { widthProfile }), style),
    separatorSpan(renderNode),
    formSpan(renderNode, 'summary', 'summary.value', option.label, style)
  ];
}

export function colorSwatchPickerSpans(
  option: ColorSwatchPickerOption<unknown>,
  renderNode: ColorSwatchPickerNode,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const selected = option.id === selectedId(renderNode);
  const disabled = option.disabled === true || renderNode.props.disabled === true;
  const label = padTextCells(clip(option.label, 8, widthProfile), 8, { widthProfile });
  const state = optionControlState(renderNode, { selected, disabled });
  const style = disabled
    ? renderNodeStyle(renderNode, 'option', 'disabled')
    : option.style ?? colorOptionStyle(option, renderNode) ?? colorSwatchStyle(renderNode);
  return [
    formSpan(renderNode, 'marker', `option.${option.id}.open`, selected ? '[' : ' ', formMarkerStyle(renderNode, state)),
    formSpan(
      renderNode,
      'swatch',
      `option.${option.id}.swatch`,
      oneCellGlyph(option.swatch ?? '■', '*', { widthProfile }),
      style
    ),
    separatorSpan(renderNode),
    formSpan(renderNode, 'option', `option.${option.id}.label`, label, style),
    formSpan(renderNode, 'marker', `option.${option.id}.close`, selected ? ']' : ' ', formMarkerStyle(renderNode, state))
  ];
}

export function calendarWeekdayHeaderSpans(
  renderNode: CalendarNode,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  return renderNode.props.weekdays.slice(0, 7).map((label, index) =>
    formSpan(
      renderNode,
      'weekday',
      `weekday.${String(index)}`,
      ` ${padTextCells(clipNoEllipsis(clean(label), 2, widthProfile), 2, { widthProfile })} `,
      formLabelStyle(renderNode, 'disabled')
    )
  );
}

export function calendarCellSpans(
  day: CalendarDay,
  renderNode: CalendarNode,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const label = padTextCells(clipNoEllipsis(day.label, 2, widthProfile), 2, {
    align: 'end',
    widthProfile
  });
  const selected = day.id === selectedId(renderNode);
  const state = calendarDayState(day, renderNode);
  if (selected) {
    return [
      formSpan(renderNode, 'marker', `day.${day.id}.open`, '[', formMarkerStyle(renderNode, state)),
      formSpan(renderNode, 'day', `day.${day.id}.label`, label, calendarDayStyle(day, renderNode)),
      formSpan(renderNode, 'marker', `day.${day.id}.close`, ']', formMarkerStyle(renderNode, state))
    ];
  }
  if (day.today === true) {
    return [
      formSpan(renderNode, 'marker', `day.${day.id}.today`, '*', formMarkerStyle(renderNode, state)),
      formSpan(renderNode, 'day', `day.${day.id}.label`, label, calendarDayStyle(day, renderNode)),
      separatorSpan(renderNode)
    ];
  }
  return [
    separatorSpan(renderNode),
    formSpan(renderNode, 'day', `day.${day.id}.label`, label, calendarDayStyle(day, renderNode)),
    separatorSpan(renderNode)
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

function colorSwatchStyle(renderNode: ColorSwatchPickerNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(renderNode, {
    part: 'swatch',
    base: {
      fg: { kind: 'theme', token: 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.primary.background' }
    }
  });
}

function colorOptionStyle(
  option: ColorSwatchPickerOption<unknown>,
  renderNode: ColorSwatchPickerNode
): TerminalStyle | undefined {
  if (option.disabled === true || renderNode.props.disabled === true) {
    return renderNodeStyle(renderNode, 'option', 'disabled');
  }
  return renderNodeStyle(renderNode, 'option', option.id === selectedId(renderNode) ? 'selected' : undefined);
}

function calendarDayStyle(
  day: CalendarDay,
  renderNode: CalendarNode
): TerminalStyle | undefined {
  if (day.disabled === true || renderNode.props.disabled === true) {
    return renderNodeStyle(renderNode, 'option', 'disabled');
  }
  if (day.id === selectedId(renderNode)) return renderNodeStyle(renderNode, 'option', 'selected');
  if (day.id === renderNode.props.focused) return renderNodeStyle(renderNode, 'option', 'focused');
  if (day.today === true) return renderNodeStyle(renderNode, 'option', 'focused');
  return renderNodeStyle(renderNode, 'option', day.outsideMonth === true ? 'disabled' : undefined);
}

function calendarDayState(
  day: CalendarDay,
  renderNode: CalendarNode
): 'selected' | 'disabled' | 'focused' | undefined {
  if (day.disabled === true || renderNode.props.disabled === true) return 'disabled';
  if (day.id === selectedId(renderNode)) return 'selected';
  if (day.id === renderNode.props.focused) return 'focused';
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
