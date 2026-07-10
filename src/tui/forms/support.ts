import type { AccessibleNode } from '../../accessibility/index.ts';
import type { ChoiceItem } from '../../components/contracts.ts';
import type {
  ButtonTone,
  ColorPickerOption,
  DatePickerDay,
  RangeSliderValue
} from '../../components/options/forms.ts';
import type { RenderNode, RenderNodeVisualState } from '../../render-node/index.ts';
import { clipTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { CursorPosition } from '../cursor.ts';
import { block, clipRenderSpans } from '../frame.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from '../frame.ts';
import {
  formErrorStyle,
  formLabelStyle,
  formLine,
  formMarkerStyle,
  formSpan,
  formValueStyle,
  labelSpans,
  optionControlState,
  separatorSpan
} from '../form-visual.ts';
import { singleLineInputBlock, singleLineInputCursor } from '../input-visual.ts';
import type { Rect } from '../layout.ts';
import { numberProp, stringify } from '../render-node-props.ts';
import {
  defaultStyleForState,
  mergeStyles,
  renderNodeStyle,
  resolveRenderNodeStyle,
  themeStyle
} from '../render-node-style.ts';
import { selectionFromUnknown } from '../text-display.ts';

export function controlInputBlock(value: string, widget: RenderNode, bounds: Rect, focused: boolean, theme: TerminalTheme): RenderBlock {
  const placeholder = clean(stringify(widget.props['placeholder']));
  const cursor = numberProp(widget, 'cursor');
  const selection = selectionFromUnknown(value, widget.props['selection']);
  const rows = [
    ...(singleLineInputBlock({
      widget,
      bounds,
      theme,
      value,
      placeholder,
      focused,
      ...(cursor === undefined ? {} : { cursor }),
      ...(selection === undefined ? {} : { selection })
    }).lines),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function inputAccessibleBase(widget: RenderNode, id: string, focused: boolean, value: string): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function fieldHeaderLines(widget: RenderNode): readonly (readonly RenderSpan[])[] {
  const rows: (readonly RenderSpan[])[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0 || widget.props['required'] === true) {
    rows.push(labelSpans(
      widget,
      'field.label',
      label,
      widget.props['disabled'] === true ? 'disabled' : undefined,
      widget.props['required'] === true
    ));
  }
  const description = clean(stringify(widget.props['description']));
  if (description.length > 0) rows.push([formSpan(widget, 'description', 'field.description', description, formValueStyle(widget, 'disabled'))]);
  const error = clean(stringify(widget.props['error']));
  if (error.length > 0) rows.push([formSpan(widget, 'error', 'validation.error', error, formErrorStyle(widget))]);
  return rows;
}

export function errorLines(widget: RenderNode, width: number): readonly RenderLine[] {
  const error = clean(stringify(widget.props['error']));
  return error.length === 0
    ? []
    : [clippedFormLine([formSpan(widget, 'error', 'validation.error', error, formErrorStyle(widget))], width)];
}

export function clippedFormLine(spans: readonly RenderSpan[], width: number): RenderLine {
  return formLine(clipRenderSpans(spans, Math.max(0, width)));
}

export function buttonSpans(widget: RenderNode, label: string, focused: boolean, theme: TerminalTheme): readonly RenderSpan[] {
  const spans: RenderSpan[] = [];
  const style = buttonStyle(widget, focused);
  const chromeStyle = buttonChromeStyle(widget, focused);
  if (focused && widget.props['disabled'] !== true) {
    spans.push(formSpan(widget, 'chrome', 'chrome.focus', theme.tokens.symbols.pointer, chromeStyle));
  }
  const state = buttonStateMarker(widget, theme);
  spans.push(formSpan(widget, 'chrome', 'chrome.open', '[ ', chromeStyle));
  if (state.length > 0) {
    spans.push(formSpan(widget, 'state', 'state.marker', state, style));
    spans.push(separatorSpan(widget));
  }
  spans.push(formSpan(widget, 'label', 'label.text', label, style));
  spans.push(formSpan(widget, 'chrome', 'chrome.close', ' ]', chromeStyle));
  return spans;
}

export function buttonStateMarker(widget: RenderNode, theme: TerminalTheme): string {
  if (widget.props['disabled'] === true) return '-';
  if (widget.props['pending'] === true) return theme.tokens.symbols.statusInfo;
  if (widget.props['pressed'] === true) return theme.tokens.symbols.selected;
  return buttonTone(widget) === 'destructive' ? theme.tokens.symbols.statusError : '';
}

export function buttonStyle(widget: RenderNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(widget, focused);
  const base = buttonBaseStyle(widget);
  return resolveRenderNodeStyle(widget, {
    slot: 'label',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

export function buttonChromeStyle(widget: RenderNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(widget, focused);
  const base = buttonChromeBaseStyle(widget);
  return resolveRenderNodeStyle(widget, {
    slot: 'border',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

export function buttonBaseStyle(widget: RenderNode): TerminalStyle | undefined {
  if (widget.props['pending'] === true) return themeStyle('status.pending', { bold: true });
  if (widget.props['pressed'] === true) return controlToneStyle('primary');
  switch (buttonTone(widget)) {
    case 'default':
      return controlToneStyle('default');
    case 'primary':
      return controlToneStyle('primary');
    case 'secondary':
      return controlToneStyle('secondary');
    case 'destructive':
      return mergeStyles(defaultStyleForState('error'), { bold: true });
  }
}

export function buttonChromeBaseStyle(widget: RenderNode): TerminalStyle | undefined {
  if (widget.props['pending'] === true) return themeStyle('status.pending', { bold: true });
  if (widget.props['pressed'] === true) return controlToneBorderStyle('primary');
  switch (buttonTone(widget)) {
    case 'default':
      return controlToneBorderStyle('default');
    case 'primary':
      return controlToneBorderStyle('primary');
    case 'secondary':
      return controlToneBorderStyle('secondary');
    case 'destructive':
      return mergeStyles(defaultStyleForState('error'), { bold: true });
  }
}

export function controlToneStyle(tone: 'default' | 'primary' | 'secondary'): TerminalStyle {
  switch (tone) {
    case 'default':
      return {
        fg: { kind: 'theme', token: 'control.foreground' },
        bg: { kind: 'theme', token: 'control.background' }
      };
    case 'primary':
      return {
        fg: { kind: 'theme', token: 'control.primary.foreground' },
        bg: { kind: 'theme', token: 'control.primary.background' },
        bold: true
      };
    case 'secondary':
      return {
        fg: { kind: 'theme', token: 'control.secondary.foreground' },
        bg: { kind: 'theme', token: 'control.secondary.background' }
      };
  }
}

export function controlToneBorderStyle(tone: 'default' | 'primary' | 'secondary'): TerminalStyle {
  switch (tone) {
    case 'default':
      return {
        fg: { kind: 'theme', token: 'control.border' },
        bg: { kind: 'theme', token: 'control.background' }
      };
    case 'primary':
      return {
        fg: { kind: 'theme', token: 'control.primary.border' },
        bg: { kind: 'theme', token: 'control.primary.background' },
        bold: true
      };
    case 'secondary':
      return {
        fg: { kind: 'theme', token: 'control.secondary.border' },
        bg: { kind: 'theme', token: 'control.secondary.background' }
      };
  }
}

export function buttonState(widget: RenderNode, focused: boolean): RenderNodeVisualState | undefined {
  if (widget.props['disabled'] === true) return 'disabled';
  return focused ? 'focused' : undefined;
}

export function buttonTone(widget: RenderNode): ButtonTone {
  const value = widget.props['tone'];
  switch (value) {
    case 'primary':
    case 'secondary':
    case 'destructive':
      return value;
    default:
      return 'default';
  }
}

export function buttonDescription(widget: RenderNode): string {
  const parts = [
    widget.props['pending'] === true ? 'Pending.' : '',
    widget.props['pressed'] === true ? 'Pressed.' : '',
    buttonTone(widget) === 'destructive' ? 'Destructive action.' : ''
  ].filter((part) => part.length > 0);
  return parts.join(' ');
}

export function fieldDescription(widget: RenderNode): string {
  const parts = [
    clean(stringify(widget.props['description'])),
    widget.props['required'] === true ? 'Required.' : '',
    clean(stringify(widget.props['error']))
  ].filter((part) => part.length > 0);
  return parts.join(' ');
}

export function formTitle(widget: RenderNode): string {
  return clean(stringify(widget.props['title']));
}

export function labelText(widget: RenderNode): string {
  return labelWithRequired(clean(stringify(widget.props['text'])), widget.props['required'] === true);
}

export function labelWithRequired(label: string, required: boolean): string {
  if (label.length === 0) return required ? 'Required' : '';
  return required ? `${label} *` : label;
}

export function selectedId(widget: RenderNode): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : undefined;
}

export function selectedOption(widget: RenderNode): ChoiceItem<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : formOptions(widget).find((option) => option.id === selected);
}

export function formOptions(widget: RenderNode): readonly ChoiceItem<unknown>[] {
  const options = widget.props['options'];
  return Array.isArray(options) ? options.flatMap((option): readonly ChoiceItem<unknown>[] => sanitizeOption(option)) : [];
}

export function sanitizeOption(value: unknown): readonly ChoiceItem<unknown>[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  const description = value['description'];
  return [{
    id: clean(id),
    label: clean(label),
    value: value['value'],
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(typeof description === 'string' ? { description: clean(description) } : {})
  }];
}

export function optionMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((option: ChoiceItem<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isOptionMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

export function checkboxListMessageFactory<TMessage>(
  widget: RenderNode<TMessage>
): ((option: ChoiceItem<unknown>, checked: boolean) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isCheckboxListMessageFactory(toMessage)) return undefined;
  return (option, checked) => toMessage(option, checked) as TMessage;
}

export function sliderMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((value: number) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isSliderMessageFactory(toMessage)) return undefined;
  return (value) => toMessage(value) as TMessage;
}

export function rangeSliderMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((value: RangeSliderValue) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isRangeSliderMessageFactory(toMessage)) return undefined;
  return (value) => toMessage(value) as TMessage;
}

export function pickerMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((option: ColorPickerOption<unknown> | DatePickerDay<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isPickerMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

export function optionStyle(option: ChoiceItem<unknown>, widget: RenderNode): TerminalStyle | undefined {
  if (option.disabled === true || widget.props['disabled'] === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (option.id === selectedId(widget)) return renderNodeStyle(widget, 'value', 'selected');
  return undefined;
}

export function selectedIds(widget: RenderNode): ReadonlySet<string> {
  const selected = widget.props['selected'];
  return new Set(Array.isArray(selected) ? selected.filter((id): id is string => typeof id === 'string').map(clean) : []);
}

interface SliderModel {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly width: number;
}

interface RangeSliderModel extends SliderModel {
  readonly start: number;
  readonly end: number;
}

export function sliderModel(widget: RenderNode): SliderModel {
  const min = finiteNumber(widget.props['min'], 0);
  const max = Math.max(min, finiteNumber(widget.props['max'], 100));
  const step = Math.max(0.000001, finiteNumber(widget.props['step'], 1));
  return {
    min,
    max,
    step,
    value: clampNumber(finiteNumber(widget.props['value'], min), min, max),
    width: Math.max(3, Math.floor(finiteNumber(widget.props['width'], 16)))
  };
}

export function rangeSliderModel(widget: RenderNode): RangeSliderModel {
  const base = sliderModel({ ...widget, props: { ...widget.props, value: widget.props['start'] } });
  const start = clampNumber(finiteNumber(widget.props['start'], base.min), base.min, base.max);
  const end = clampNumber(finiteNumber(widget.props['end'], base.max), base.min, base.max);
  return {
    ...base,
    start: Math.min(start, end),
    end: Math.max(start, end)
  };
}

export function sliderTrackSpans(widget: RenderNode, model: SliderModel): readonly RenderSpan[] {
  const position = sliderPosition(model, model.value);
  const disabled = widget.props['disabled'] === true;
  return Array.from({ length: model.width }, (_, index): RenderSpan => {
    const current = index === position
      ? { text: '●', label: 'track.handle', selected: true }
      : index < position
        ? { text: '━', label: 'track.filled', selected: false }
        : { text: '─', label: 'track.empty', selected: false };
    return formSpan(widget, current.selected ? 'handle' : 'track', current.label, current.text, sliderPartStyle(widget, current.label, disabled));
  });
}

export function rangeSliderTrackSpans(widget: RenderNode, model: RangeSliderModel): readonly RenderSpan[] {
  const start = sliderPosition(model, model.start);
  const end = sliderPosition(model, model.end);
  const disabled = widget.props['disabled'] === true;
  return Array.from({ length: model.width }, (_, index): RenderSpan => {
    const current = index === start || index === end
      ? { text: '●', label: index === start ? 'track.startHandle' : 'track.endHandle', selected: true }
      : index > start && index < end
        ? { text: '━', label: 'track.filled', selected: false }
        : { text: '─', label: 'track.empty', selected: false };
    return formSpan(widget, current.selected ? 'handle' : 'track', current.label, current.text, sliderPartStyle(widget, current.label, disabled));
  });
}

export function sliderPartStyle(widget: RenderNode, label: string, disabled: boolean): TerminalStyle | undefined {
  const base: TerminalStyle = label.toLocaleLowerCase().endsWith('handle')
    ? {
        fg: { kind: 'theme', token: 'control.handle' },
        bg: { kind: 'theme', token: 'control.track.filled' },
        bold: true
      }
    : label === 'track.filled'
      ? { fg: { kind: 'theme', token: 'control.track.filled' } }
      : { fg: { kind: 'theme', token: 'control.track' } };
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    base,
    ...(disabled ? { state: 'disabled' } : {})
  });
}

export function toggleValueStyle(widget: RenderNode, checked: boolean): TerminalStyle | undefined {
  if (widget.props['disabled'] === true) return renderNodeStyle(widget, 'value', 'disabled');
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    base: {
      fg: { kind: 'theme', token: checked ? 'control.primary.foreground' : 'control.foreground' },
      bg: { kind: 'theme', token: checked ? 'control.toggle.on.background' : 'control.toggle.off.background' },
      ...(checked ? { bold: true } : {})
    }
  });
}

export function sliderPosition(model: SliderModel, value: number): number {
  if (model.max === model.min) return 0;
  return Math.max(0, Math.min(model.width - 1, Math.round(((value - model.min) / (model.max - model.min)) * (model.width - 1))));
}

export function sliderValues(model: SliderModel): readonly number[] {
  if (model.width <= 1) return [model.min];
  return Array.from({ length: model.width }, (_, index) => {
    const raw = model.min + ((model.max - model.min) * index) / (model.width - 1);
    return quantize(raw, model);
  });
}

export function rangeForClick(model: RangeSliderModel, value: number): RangeSliderValue {
  const distanceToStart = Math.abs(value - model.start);
  const distanceToEnd = Math.abs(value - model.end);
  if (distanceToStart <= distanceToEnd) return { start: Math.min(value, model.end), end: model.end };
  return { start: model.start, end: Math.max(value, model.start) };
}

export function quantize(value: number, model: SliderModel): number {
  const steps = Math.round((value - model.min) / model.step);
  return clampNumber(model.min + steps * model.step, model.min, model.max);
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

export function labelPrefix(label: string): string {
  return label.length === 0 ? '' : `${label}: `;
}

export function colorOptions(widget: RenderNode): readonly ColorPickerOption<unknown>[] {
  const options = widget.props['options'];
  return Array.isArray(options) ? options.flatMap((option): readonly ColorPickerOption<unknown>[] => sanitizeColorOption(option)) : [];
}

export function sanitizeColorOption(value: unknown): readonly ColorPickerOption<unknown>[] {
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

export function selectedColorOption(widget: RenderNode): ColorPickerOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : colorOptions(widget).find((option) => option.id === selected);
}

export function datePickerDays(widget: RenderNode): readonly DatePickerDay<unknown>[] {
  const days = widget.props['days'];
  return Array.isArray(days) ? days.flatMap((day): readonly DatePickerDay<unknown>[] => sanitizeDatePickerDay(day)) : [];
}

export function sanitizeDatePickerDay(value: unknown): readonly DatePickerDay<unknown>[] {
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

export function selectedDatePickerDay(widget: RenderNode): DatePickerDay<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : datePickerDays(widget).find((day) => day.id === selected);
}

export function pickerColumns(widget: RenderNode, fallback: number): number {
  return Math.max(1, Math.floor(finiteNumber(widget.props['columns'], fallback)));
}

export function pickerCellWidth(widget: RenderNode): number {
  return widget.kind === 'datePicker' ? 4 : 12;
}

export function pickerOptionRowOffset(widget: RenderNode, columns: number): number {
  let offset = clean(stringify(widget.props['label'])).length > 0 ? 1 : 0;
  if (widget.kind === 'colorPicker' && selectedColorOption(widget) !== undefined) offset += 1;
  if (widget.kind === 'datePicker' && columns === 7) offset += 1;
  return offset;
}

export function colorPickerSummarySpans(option: ColorPickerOption<unknown>, widget: RenderNode): readonly RenderSpan[] {
  const disabled = option.disabled === true || widget.props['disabled'] === true;
  const style = disabled ? renderNodeStyle(widget, 'value', 'disabled') : option.style ?? colorSwatchStyle(widget);
  return [
    formSpan(widget, 'summary', 'summary.label', 'Selected', formLabelStyle(widget, disabled ? 'disabled' : undefined)),
    formSpan(widget, 'separator', 'summary.separator', ': '),
    formSpan(widget, 'swatch', 'summary.swatch', option.swatch ?? '■', style),
    separatorSpan(widget),
    formSpan(widget, 'summary', 'summary.value', option.label, style)
  ];
}

export function colorPickerSpans(option: ColorPickerOption<unknown>, widget: RenderNode): readonly RenderSpan[] {
  const selected = option.id === selectedId(widget);
  const disabled = option.disabled === true || widget.props['disabled'] === true;
  const swatch = option.swatch ?? '■';
  const label = clip(option.label, 8).padEnd(8, ' ');
  const state = optionControlState(widget, { selected, disabled });
  const style = disabled ? renderNodeStyle(widget, 'value', 'disabled') : option.style ?? optionStyle(option, widget) ?? colorSwatchStyle(widget);
  return [
    formSpan(widget, 'marker', `option.${option.id}.open`, selected ? '[' : ' ', formMarkerStyle(widget, state)),
    formSpan(widget, 'swatch', `option.${option.id}.swatch`, swatch, style),
    separatorSpan(widget),
    formSpan(widget, 'option', `option.${option.id}.label`, label, style),
    formSpan(widget, 'marker', `option.${option.id}.close`, selected ? ']' : ' ', formMarkerStyle(widget, state)),
    separatorSpan(widget)
  ];
}

export function colorSwatchStyle(widget: RenderNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    base: {
      fg: { kind: 'theme', token: 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.primary.background' }
    }
  });
}

export function datePickerWeekdayHeaderSpans(widget: RenderNode): readonly RenderSpan[] {
  return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) =>
    formSpan(widget, 'weekday', `weekday.${label.toLowerCase()}`, ` ${label} `, formLabelStyle(widget, 'disabled'))
  );
}

export function datePickerCellSpans(day: DatePickerDay<unknown>, widget: RenderNode): readonly RenderSpan[] {
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

export function datePickerDayStyle(day: DatePickerDay<unknown>, widget: RenderNode): TerminalStyle | undefined {
  if (day.disabled === true || widget.props['disabled'] === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (day.id === selectedId(widget)) return renderNodeStyle(widget, 'value', 'selected');
  if (day.today === true) return renderNodeStyle(widget, 'value', 'focused');
  if (day.outsideMonth === true) return renderNodeStyle(widget, 'value', 'disabled');
  return undefined;
}

export function datePickerDayState(day: DatePickerDay<unknown>, widget: RenderNode): 'selected' | 'disabled' | 'focused' | undefined {
  if (day.disabled === true || widget.props['disabled'] === true || day.outsideMonth === true) return 'disabled';
  if (day.id === selectedId(widget)) return 'selected';
  return day.today === true ? 'focused' : undefined;
}

export function inputValue(widget: RenderNode): string {
  return clean(stringify(widget.props['value']));
}

export function numberInputValue(widget: RenderNode): string {
  const value = widget.props['value'];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function singleLineCursor(widget: RenderNode, value: string, cursor: number | undefined, bounds: Rect, theme: TerminalTheme): CursorPosition {
  return singleLineInputCursor({
    widget,
    bounds,
    theme,
    value,
    focused: true,
    ...(cursor === undefined ? {} : { cursor })
  });
}

export function clip(value: string, width: number): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '…' }).text;
}

export function clipNoEllipsis(value: string, width: number): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '' }).text;
}

export function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOptionMessageFactory(value: unknown): value is (option: ChoiceItem<unknown>) => unknown {
  return typeof value === 'function';
}

export function isCheckboxListMessageFactory(
  value: unknown
): value is (option: ChoiceItem<unknown>, checked: boolean) => unknown {
  return typeof value === 'function';
}

export function isSliderMessageFactory(value: unknown): value is (value: number) => unknown {
  return typeof value === 'function';
}

export function isRangeSliderMessageFactory(value: unknown): value is (value: RangeSliderValue) => unknown {
  return typeof value === 'function';
}

export function isPickerMessageFactory(
  value: unknown
): value is (option: ColorPickerOption<unknown> | DatePickerDay<unknown>) => unknown {
  return typeof value === 'function';
}
