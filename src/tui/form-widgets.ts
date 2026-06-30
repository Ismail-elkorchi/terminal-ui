import { clipTextCells, sanitizeTerminalText } from '../text/index.ts';
import { block, line, span } from './frame.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn } from './text-display.ts';
import { widgetStyle } from './widget-style.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { ColorPickerOption, DatePickerDay, FormOption, RangeSliderValue, Widget } from '../widgets/index.ts';
import type { RenderBlock, RenderLine, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';
import type { HitTarget } from './widget-renderer.ts';

export function formContentBounds(widget: Widget, bounds: Rect): Rect {
  const titleRows = formTitle(widget).length === 0 ? 0 : 1;
  return {
    row: bounds.row + titleRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleRows)
  };
}

export function fieldContentBounds(widget: Widget, bounds: Rect): Rect {
  const headerRows = fieldHeaderLines(widget).length;
  return {
    row: bounds.row + headerRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - headerRows)
  };
}

export function formBlock(widget: Widget, bounds: Rect): RenderBlock {
  const title = formTitle(widget);
  if (title.length === 0 || bounds.height <= 0) return block([]);
  return block([line([styledSpan(clip(title, bounds.width), widgetStyle(widget, 'title'))])]);
}

export function fieldBlock(widget: Widget, bounds: Rect): RenderBlock {
  return block(fieldHeaderLines(widget).slice(0, Math.max(0, bounds.height)).map((item) => {
    const text = clip(item.text, bounds.width);
    return line([styledSpan(text, item.style)]);
  }));
}

export function labelBlock(widget: Widget, bounds: Rect): RenderBlock {
  const text = labelText(widget);
  return block([line([styledSpan(clip(text, bounds.width), widgetStyle(widget, 'label', widget.props['disabled'] === true ? 'disabled' : undefined))])]);
}

export function buttonBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  const label = clean(stringify(widget.props['label'])) || 'Button';
  const style = widgetStyle(widget, 'label', widget.props['disabled'] === true ? 'disabled' : focused ? 'focused' : undefined);
  return block([line([styledSpan(clip(`[ ${label} ]`, bounds.width), style)])]);
}

export function checkboxBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const checked = widget.props['checked'] === true;
  const symbol = checked ? theme.symbols.checkboxChecked : theme.symbols.checkboxUnchecked;
  const label = labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true);
  const lines = [
    line([styledSpan(clip(`${symbol} ${label}`, bounds.width), controlStyle(widget))]),
    ...errorLines(widget, bounds.width)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function toggleSwitchBlock(widget: Widget, bounds: Rect): RenderBlock {
  const checked = widget.props['checked'] === true;
  const label = clean(stringify(widget.props['label']));
  const onLabel = clean(stringify(widget.props['onLabel'])) || 'On';
  const offLabel = clean(stringify(widget.props['offLabel'])) || 'Off';
  const switchText = checked ? `[ ${onLabel} ] ${offLabel}` : `${onLabel} [ ${offLabel} ]`;
  const lines = [
    line([styledSpan(clip(`${label}: ${switchText}`, bounds.width), controlStyle(widget))]),
    ...errorLines(widget, bounds.width)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function sliderBlock(widget: Widget, bounds: Rect): RenderBlock {
  const model = sliderModel(widget);
  const label = clean(stringify(widget.props['label']));
  const rows = [
    line([styledSpan(clip(`${labelPrefix(label)}${sliderTrack(model)} ${formatNumber(model.value)}`, bounds.width), controlStyle(widget))]),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function rangeSliderBlock(widget: Widget, bounds: Rect): RenderBlock {
  const model = rangeSliderModel(widget);
  const label = clean(stringify(widget.props['label']));
  const rows = [
    line([styledSpan(clip(`${labelPrefix(label)}${rangeSliderTrack(model)} ${formatNumber(model.start)}-${formatNumber(model.end)}`, bounds.width), controlStyle(widget))]),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function checkboxListBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) {
    lines.push(line([styledSpan(clip(labelWithRequired(label, widget.props['required'] === true), bounds.width), widgetStyle(widget, 'label'))]));
  }
  const selected = selectedIds(widget);
  for (const option of formOptions(widget)) {
    const symbol = selected.has(option.id) ? theme.symbols.checkboxChecked : theme.symbols.checkboxUnchecked;
    lines.push(line([styledSpan(clip(`${symbol} ${option.label}`, bounds.width), optionStyle(option, widget))]));
  }
  lines.push(...errorLines(widget, bounds.width));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function radioGroupBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) {
    lines.push(line([styledSpan(clip(labelWithRequired(label, widget.props['required'] === true), bounds.width), widgetStyle(widget, 'label'))]));
  }
  const selected = selectedId(widget);
  for (const option of formOptions(widget)) {
    const symbol = option.id === selected ? theme.symbols.radioChecked : theme.symbols.radioUnchecked;
    const text = `${symbol} ${option.label}`;
    lines.push(line([styledSpan(clip(text, bounds.width), optionStyle(option, widget))]));
  }
  lines.push(...errorLines(widget, bounds.width));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function colorPickerBlock(widget: Widget, bounds: Rect): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) rows.push(line([styledSpan(clip(label, bounds.width), widgetStyle(widget, 'label'))]));
  const columns = pickerColumns(widget, 4);
  const options = colorOptions(widget);
  for (let index = 0; index < options.length; index += columns) {
    rows.push(line(options.slice(index, index + columns).flatMap((option) => colorPickerSpans(option, widget))));
  }
  rows.push(...errorLines(widget, bounds.width));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function datePickerBlock(widget: Widget, bounds: Rect): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) rows.push(line([styledSpan(clip(label, bounds.width), widgetStyle(widget, 'label'))]));
  const columns = pickerColumns(widget, 7);
  const days = datePickerDays(widget);
  for (let index = 0; index < days.length; index += columns) {
    rows.push(line(days.slice(index, index + columns).map((day) => styledSpan(datePickerCell(day, widget), datePickerDayStyle(day, widget)))));
  }
  rows.push(...errorLines(widget, bounds.width));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function selectBoxBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedOption(widget);
  const label = clean(stringify(widget.props['label']));
  const placeholder = clean(stringify(widget.props['placeholder'])) || 'Select…';
  const value = selected?.label ?? placeholder;
  const prefix = label.length === 0 ? '' : `${labelWithRequired(label, widget.props['required'] === true)}: `;
  const style = widget.props['disabled'] === true
    ? widgetStyle(widget, 'value', 'disabled')
    : selected === undefined
      ? widgetStyle(widget, 'placeholder')
      : widgetStyle(widget, 'value');
  const rows = [
    line([styledSpan(clip(`${prefix}${value} ${theme.symbols.treeCollapsed}`, bounds.width), style)]),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function textInputBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  return controlInputBlock(inputValue(widget), widget, bounds, focused);
}

export function numberInputBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  return controlInputBlock(numberInputValue(widget), widget, bounds, focused);
}

export function formAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: formTitle(widget) || id,
    ...(focused ? { focused } : {})
  };
}

export function fieldAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'text',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function labelAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const description = stringify(widget.props['forId']);
  return {
    id,
    role: 'text',
    label: labelText(widget) || id,
    ...(description.length === 0 ? {} : { description: `Labels ${description}.` }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {})
  };
}

export function buttonAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'button',
    label: clean(stringify(widget.props['label'])) || id,
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'checkbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    checked: widget.props['checked'] === true,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function toggleSwitchAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const onLabel = clean(stringify(widget.props['onLabel'])) || 'On';
  const offLabel = clean(stringify(widget.props['offLabel'])) || 'Off';
  const checked = widget.props['checked'] === true;
  return {
    id,
    role: 'checkbox',
    label: clean(stringify(widget.props['label'])) || id,
    value: checked ? onLabel : offLabel,
    checked,
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function sliderAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const model = sliderModel(widget);
  return {
    id,
    role: 'progressbar',
    label: clean(stringify(widget.props['label'])) || id,
    value: formatNumber(model.value),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function rangeSliderAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const model = rangeSliderModel(widget);
  return {
    id,
    role: 'progressbar',
    label: clean(stringify(widget.props['label'])) || id,
    value: `${formatNumber(model.start)}-${formatNumber(model.end)}`,
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxListAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedIds(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    value: `${String(selected.size)} selected`,
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxListAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedIds(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'checkboxList'}:${option.id}`,
    role: 'checkbox',
    label: option.label,
    checked: selected.has(option.id),
    selected: selected.has(option.id),
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function radioGroupAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(widget);
  const description = fieldDescription(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function radioGroupAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'radioGroup'}:${option.id}`,
    role: 'radio',
    label: option.label,
    checked: option.id === selected,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function colorPickerAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedColorOption(widget);
  return {
    id,
    role: 'listbox',
    label: clean(stringify(widget.props['label'])) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function colorPickerAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return colorOptions(widget).map((option) => ({
    id: `${widget.id ?? 'colorPicker'}:${option.id}`,
    role: 'option',
    label: option.label,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function datePickerAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedDatePickerDay(widget);
  return {
    id,
    role: 'table',
    label: clean(stringify(widget.props['label'])) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function datePickerAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return datePickerDays(widget).map((day) => ({
    id: `${widget.id ?? 'datePicker'}:${day.id}`,
    role: 'option',
    label: day.label,
    selected: day.id === selected,
    ...(day.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function selectBoxAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(widget);
  const description = fieldDescription(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function selectBoxAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'selectBox'}:${option.id}`,
    role: 'option',
    label: option.label,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function textInputAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, inputValue(widget));
}

export function numberInputAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, numberInputValue(widget));
}

export function textInputCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  return singleLineCursor(inputValue(widget), numberProp(widget, 'cursor'), bounds);
}

export function numberInputCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  return singleLineCursor(numberInputValue(widget), numberProp(widget, 'cursor'), bounds);
}

export function controlHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  if (!('message' in widget.props)) return [];
  const message = widget.props['message'] as TMessage;
  return [{
    id: `${widget.id ?? widget.kind}:control`,
    bounds,
    message,
    cursor: 'pointer'
  }];
}

export function optionHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  const toMessage = optionMessageFactory(widget);
  if (toMessage === undefined) return [];
  const labelOffset = clean(stringify(widget.props['label'])).length > 0 ? 1 : 0;
  return formOptions(widget).flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${widget.id ?? widget.kind}:${option.id}`,
      bounds: {
        row: bounds.row + labelOffset + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: toMessage(option),
      cursor: 'pointer'
    }];
  });
}

export function checkboxListHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  const toMessage = checkboxListMessageFactory(widget);
  if (toMessage === undefined) return [];
  const selected = selectedIds(widget);
  const labelOffset = clean(stringify(widget.props['label'])).length > 0 ? 1 : 0;
  return formOptions(widget).flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${widget.id ?? widget.kind}:${option.id}`,
      bounds: {
        row: bounds.row + labelOffset + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: toMessage(option, !selected.has(option.id)),
      cursor: 'pointer'
    }];
  });
}

export function sliderHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  const toMessage = sliderMessageFactory(widget);
  if (toMessage === undefined) return [];
  const model = sliderModel(widget);
  return sliderValues(model).map((value, index) => ({
    id: `${widget.id ?? widget.kind}:value:${String(index)}`,
    bounds: {
      row: bounds.row,
      column: bounds.column + labelPrefix(clean(stringify(widget.props['label']))).length + index,
      width: 1,
      height: 1
    },
    message: toMessage(value),
    cursor: 'pointer'
  }));
}

export function rangeSliderHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  const toMessage = rangeSliderMessageFactory(widget);
  if (toMessage === undefined) return [];
  const model = rangeSliderModel(widget);
  return sliderValues(model).map((value, index) => ({
    id: `${widget.id ?? widget.kind}:value:${String(index)}`,
    bounds: {
      row: bounds.row,
      column: bounds.column + labelPrefix(clean(stringify(widget.props['label']))).length + index,
      width: 1,
      height: 1
    },
    message: toMessage(rangeForClick(model, value)),
    cursor: 'pointer'
  }));
}

export function pickerHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  const toMessage = pickerMessageFactory(widget);
  if (toMessage === undefined) return [];
  const labelOffset = clean(stringify(widget.props['label'])).length > 0 ? 1 : 0;
  const columns = pickerColumns(widget, widget.kind === 'datePicker' ? 7 : 4);
  const options = widget.kind === 'datePicker' ? datePickerDays(widget) : colorOptions(widget);
  return options.flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${widget.id ?? widget.kind}:${option.id}`,
      bounds: {
        row: bounds.row + labelOffset + Math.floor(index / columns),
        column: bounds.column + (index % columns) * pickerCellWidth(widget),
        width: pickerCellWidth(widget),
        height: 1
      },
      message: toMessage(option),
      cursor: 'pointer'
    }];
  });
}

function controlInputBlock(value: string, widget: Widget, bounds: Rect, focused: boolean): RenderBlock {
  const placeholder = clean(stringify(widget.props['placeholder']));
  const showsPlaceholder = value.length === 0 && placeholder.length > 0;
  const displayValue = showsPlaceholder ? placeholder : value;
  const style = widget.props['disabled'] === true
    ? widgetStyle(widget, 'value', 'disabled')
    : showsPlaceholder
      ? widgetStyle(widget, 'placeholder')
      : widgetStyle(widget, 'value', focused ? 'focused' : undefined);
  const spans = showsPlaceholder
    ? [styledSpan(displayValue, style)]
    : selectedTextSpans(
        displayValue,
        selectionFromUnknown(displayValue, widget.props['selection']),
        style,
        widgetStyle(widget, 'value', 'selected')
      );
  const rows = [
    line(spans),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

function inputAccessibleBase(widget: Widget, id: string, focused: boolean, value: string): AccessibleNode {
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

function fieldHeaderLines(widget: Widget): readonly { readonly text: string; readonly style?: TerminalStyle }[] {
  const rows: { readonly text: string; readonly style?: TerminalStyle }[] = [];
  const label = labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true);
  if (label.length > 0) pushStyledRow(rows, label, widgetStyle(widget, 'label', widget.props['disabled'] === true ? 'disabled' : undefined));
  const description = clean(stringify(widget.props['description']));
  if (description.length > 0) pushStyledRow(rows, description, widgetStyle(widget, 'value', 'disabled'));
  const error = clean(stringify(widget.props['error']));
  if (error.length > 0) pushStyledRow(rows, error, widgetStyle(widget, 'error', 'error'));
  return rows;
}

function errorLines(widget: Widget, width: number): readonly RenderLine[] {
  const error = clean(stringify(widget.props['error']));
  return error.length === 0 ? [] : [line([styledSpan(clip(error, width), widgetStyle(widget, 'error', 'error'))])];
}

function styledSpan(text: string, style: TerminalStyle | undefined) {
  return style === undefined ? span(text) : span(text, { style });
}

function pushStyledRow(rows: { text: string; style?: TerminalStyle }[], text: string, style: TerminalStyle | undefined): void {
  rows.push(style === undefined ? { text } : { text, style });
}

function fieldDescription(widget: Widget): string {
  const parts = [
    clean(stringify(widget.props['description'])),
    widget.props['required'] === true ? 'Required.' : '',
    clean(stringify(widget.props['error']))
  ].filter((part) => part.length > 0);
  return parts.join(' ');
}

function formTitle(widget: Widget): string {
  return clean(stringify(widget.props['title']));
}

function labelText(widget: Widget): string {
  return labelWithRequired(clean(stringify(widget.props['text'])), widget.props['required'] === true);
}

function labelWithRequired(label: string, required: boolean): string {
  if (label.length === 0) return required ? 'Required' : '';
  return required ? `${label} *` : label;
}

function selectedId(widget: Widget): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedOption(widget: Widget): FormOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : formOptions(widget).find((option) => option.id === selected);
}

function formOptions(widget: Widget): readonly FormOption<unknown>[] {
  const options = widget.props['options'];
  return Array.isArray(options) ? options.flatMap((option): readonly FormOption<unknown>[] => sanitizeOption(option)) : [];
}

function sanitizeOption(value: unknown): readonly FormOption<unknown>[] {
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

function optionMessageFactory<TMessage>(widget: Widget<TMessage>): ((option: FormOption<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isOptionMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

function checkboxListMessageFactory<TMessage>(
  widget: Widget<TMessage>
): ((option: FormOption<unknown>, checked: boolean) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isCheckboxListMessageFactory(toMessage)) return undefined;
  return (option, checked) => toMessage(option, checked) as TMessage;
}

function sliderMessageFactory<TMessage>(widget: Widget<TMessage>): ((value: number) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isSliderMessageFactory(toMessage)) return undefined;
  return (value) => toMessage(value) as TMessage;
}

function rangeSliderMessageFactory<TMessage>(widget: Widget<TMessage>): ((value: RangeSliderValue) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isRangeSliderMessageFactory(toMessage)) return undefined;
  return (value) => toMessage(value) as TMessage;
}

function pickerMessageFactory<TMessage>(widget: Widget<TMessage>): ((option: ColorPickerOption<unknown> | DatePickerDay<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isPickerMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

function optionStyle(option: FormOption<unknown>, widget: Widget): TerminalStyle | undefined {
  if (option.disabled === true || widget.props['disabled'] === true) return widgetStyle(widget, 'value', 'disabled');
  if (option.id === selectedId(widget)) return widgetStyle(widget, 'value', 'selected');
  return undefined;
}

function controlStyle(widget: Widget): TerminalStyle | undefined {
  return widget.props['disabled'] === true ? widgetStyle(widget, 'value', 'disabled') : undefined;
}

function selectedIds(widget: Widget): ReadonlySet<string> {
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

function sliderModel(widget: Widget): SliderModel {
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

function rangeSliderModel(widget: Widget): RangeSliderModel {
  const base = sliderModel({ ...widget, props: { ...widget.props, value: widget.props['start'] } });
  const start = clampNumber(finiteNumber(widget.props['start'], base.min), base.min, base.max);
  const end = clampNumber(finiteNumber(widget.props['end'], base.max), base.min, base.max);
  return {
    ...base,
    start: Math.min(start, end),
    end: Math.max(start, end)
  };
}

function sliderTrack(model: SliderModel): string {
  const position = sliderPosition(model, model.value);
  return Array.from({ length: model.width }, (_, index) => index === position ? '●' : index < position ? '━' : '─').join('');
}

function rangeSliderTrack(model: RangeSliderModel): string {
  const start = sliderPosition(model, model.start);
  const end = sliderPosition(model, model.end);
  return Array.from({ length: model.width }, (_, index) => {
    if (index === start || index === end) return '●';
    if (index > start && index < end) return '━';
    return '─';
  }).join('');
}

function sliderPosition(model: SliderModel, value: number): number {
  if (model.max === model.min) return 0;
  return Math.max(0, Math.min(model.width - 1, Math.round(((value - model.min) / (model.max - model.min)) * (model.width - 1))));
}

function sliderValues(model: SliderModel): readonly number[] {
  if (model.width <= 1) return [model.min];
  return Array.from({ length: model.width }, (_, index) => {
    const raw = model.min + ((model.max - model.min) * index) / (model.width - 1);
    return quantize(raw, model);
  });
}

function rangeForClick(model: RangeSliderModel, value: number): RangeSliderValue {
  const distanceToStart = Math.abs(value - model.start);
  const distanceToEnd = Math.abs(value - model.end);
  if (distanceToStart <= distanceToEnd) return { start: Math.min(value, model.end), end: model.end };
  return { start: model.start, end: Math.max(value, model.start) };
}

function quantize(value: number, model: SliderModel): number {
  const steps = Math.round((value - model.min) / model.step);
  return clampNumber(model.min + steps * model.step, model.min, model.max);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

function labelPrefix(label: string): string {
  return label.length === 0 ? '' : `${label}: `;
}

function colorOptions(widget: Widget): readonly ColorPickerOption<unknown>[] {
  const options = widget.props['options'];
  return Array.isArray(options) ? options.flatMap((option): readonly ColorPickerOption<unknown>[] => sanitizeColorOption(option)) : [];
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

function selectedColorOption(widget: Widget): ColorPickerOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : colorOptions(widget).find((option) => option.id === selected);
}

function datePickerDays(widget: Widget): readonly DatePickerDay<unknown>[] {
  const days = widget.props['days'];
  return Array.isArray(days) ? days.flatMap((day): readonly DatePickerDay<unknown>[] => sanitizeDatePickerDay(day)) : [];
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

function selectedDatePickerDay(widget: Widget): DatePickerDay<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : datePickerDays(widget).find((day) => day.id === selected);
}

function pickerColumns(widget: Widget, fallback: number): number {
  return Math.max(1, Math.floor(finiteNumber(widget.props['columns'], fallback)));
}

function pickerCellWidth(widget: Widget): number {
  return widget.kind === 'datePicker' ? 4 : 12;
}

function colorPickerSpans(option: ColorPickerOption<unknown>, widget: Widget): readonly ReturnType<typeof styledSpan>[] {
  const selected = option.id === selectedId(widget);
  const disabled = option.disabled === true || widget.props['disabled'] === true;
  const swatch = option.swatch ?? '■';
  const label = clip(option.label, 8).padEnd(8, ' ');
  const prefix = selected ? '[' : ' ';
  const suffix = selected ? ']' : ' ';
  const style = disabled ? widgetStyle(widget, 'value', 'disabled') : option.style ?? optionStyle(option, widget);
  return [
    styledSpan(`${prefix}${swatch} ${label}${suffix}`, style),
    span(' ')
  ];
}

function datePickerCell(day: DatePickerDay<unknown>, widget: Widget): string {
  const label = clipNoEllipsis(day.label, 2).padStart(2, ' ');
  if (day.id === selectedId(widget)) return `[${label}]`;
  if (day.today === true) return `*${label} `;
  return ` ${label} `;
}

function datePickerDayStyle(day: DatePickerDay<unknown>, widget: Widget): TerminalStyle | undefined {
  if (day.disabled === true || widget.props['disabled'] === true) return widgetStyle(widget, 'value', 'disabled');
  if (day.id === selectedId(widget)) return widgetStyle(widget, 'value', 'selected');
  if (day.today === true) return widgetStyle(widget, 'value', 'focused');
  if (day.outsideMonth === true) return widgetStyle(widget, 'value', 'disabled');
  return undefined;
}

function inputValue(widget: Widget): string {
  return clean(stringify(widget.props['value']));
}

function numberInputValue(widget: Widget): string {
  const value = widget.props['value'];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function singleLineCursor(value: string, cursor: number | undefined, bounds: Rect): { readonly row: number; readonly column: number } {
  return {
    row: bounds.row,
    column: bounds.column + singleLineCursorColumn(value, cursor, Math.max(0, bounds.width - 1))
  };
}

function clip(value: string, width: number): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '…' }).text;
}

function clipNoEllipsis(value: string, width: number): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '' }).text;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionMessageFactory(value: unknown): value is (option: FormOption<unknown>) => unknown {
  return typeof value === 'function';
}

function isCheckboxListMessageFactory(
  value: unknown
): value is (option: FormOption<unknown>, checked: boolean) => unknown {
  return typeof value === 'function';
}

function isSliderMessageFactory(value: unknown): value is (value: number) => unknown {
  return typeof value === 'function';
}

function isRangeSliderMessageFactory(value: unknown): value is (value: RangeSliderValue) => unknown {
  return typeof value === 'function';
}

function isPickerMessageFactory(
  value: unknown
): value is (option: ColorPickerOption<unknown> | DatePickerDay<unknown>) => unknown {
  return typeof value === 'function';
}
