import type { RenderNode } from '../render-node/index.ts';
import type { RenderNodeVisualState } from '../render-node/index.ts';
import { clipTextCells, sanitizeTerminalText } from '../text/index.ts';
import { block, clipRenderSpans } from './frame.ts';
import {
  controlLabelSpans, controlPrefixSpans, formControlState, formErrorStyle, formLabelStyle, formLine, formMarkerStyle, formPlaceholderStyle, formSpan, formValueStyle, labelSpans, optionControlState, separatorSpan
} from './form-visual.ts';
import { selectionFromUnknown } from './text-display.ts';
import { singleLineInputBlock, singleLineInputCursor } from './input-visual.ts';
import { defaultStyleForState, mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import { numberProp, stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import { defaultTheme, type TerminalTheme } from '../theme/index.ts';
import type { ChoiceItem } from '../components/contracts.ts';
import type { ButtonTone, ColorPickerOption, DatePickerDay, RangeSliderValue } from '../components/types.ts';
import type { CursorPosition } from './cursor.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';
import type { HitTarget } from './render-node-renderer.ts';

export function formContentBounds(widget: RenderNode, bounds: Rect): Rect {
  const titleRows = formTitle(widget).length === 0 ? 0 : 1;
  return {
    row: bounds.row + titleRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleRows)
  };
}

export function fieldContentBounds(widget: RenderNode, bounds: Rect): Rect {
  const headerRows = fieldHeaderLines(widget).length;
  return {
    row: bounds.row + headerRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - headerRows)
  };
}

export function formBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  const title = formTitle(widget);
  if (title.length === 0 || bounds.height <= 0) return block([]);
  return block([clippedFormLine([
    formSpan(widget, 'title', 'form.title', title, renderNodeStyle(widget, 'title'))
  ], bounds.width)]);
}

export function fieldBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  return block(fieldHeaderLines(widget).slice(0, Math.max(0, bounds.height)).map((item) =>
    clippedFormLine(item, bounds.width)
  ));
}

export function labelBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  return block([clippedFormLine(labelSpans(
    widget,
    'label',
    clean(stringify(widget.props['text'])),
    widget.props['disabled'] === true ? 'disabled' : undefined,
    widget.props['required'] === true
  ), bounds.width)]);
}

export function buttonBlock(widget: RenderNode, bounds: Rect, focused = false, theme: TerminalTheme): RenderBlock {
  const label = clean(stringify(widget.props['label'])) || 'Button';
  return block([clippedFormLine(buttonSpans(widget, label, focused, theme), bounds.width)]);
}

export function checkboxBlock(widget: RenderNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const checked = widget.props['checked'] === true;
  const symbol = checked ? theme.tokens.symbols.checkboxChecked : theme.tokens.symbols.checkboxUnchecked;
  const state = formControlState(widget, checked);
  const lines = [
    clippedFormLine([
      formSpan(widget, 'marker', checked ? 'marker.checked' : 'marker.unchecked', symbol, formMarkerStyle(widget, state)),
      separatorSpan(widget),
      ...labelSpans(widget, 'label', clean(stringify(widget.props['label'])), state, widget.props['required'] === true)
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function toggleSwitchBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  const checked = widget.props['checked'] === true;
  const label = clean(stringify(widget.props['label']));
  const onLabel = clean(stringify(widget.props['onLabel'])) || 'On';
  const offLabel = clean(stringify(widget.props['offLabel'])) || 'Off';
  const enabledState = formControlState(widget, true);
  const disabledState = formControlState(widget, false);
  const lines = [
    clippedFormLine([
      ...controlPrefixSpans(widget, label, formControlState(widget)),
      ...(checked
        ? [
            formSpan(widget, 'chrome', 'value.on.open', '[', formMarkerStyle(widget, enabledState)),
            separatorSpan(widget),
            formSpan(widget, 'value', 'value.on', onLabel, toggleValueStyle(widget, true)),
            separatorSpan(widget),
            formSpan(widget, 'chrome', 'value.on.close', ']', formMarkerStyle(widget, enabledState)),
            separatorSpan(widget),
            formSpan(widget, 'placeholder', 'value.off', offLabel, formPlaceholderStyle(widget))
          ]
        : [
            formSpan(widget, 'placeholder', 'value.on', onLabel, formPlaceholderStyle(widget)),
            separatorSpan(widget),
            formSpan(widget, 'chrome', 'value.off.open', '[', formMarkerStyle(widget, disabledState)),
            separatorSpan(widget),
            formSpan(widget, 'value', 'value.off', offLabel, toggleValueStyle(widget, false)),
            separatorSpan(widget),
            formSpan(widget, 'chrome', 'value.off.close', ']', formMarkerStyle(widget, disabledState))
          ])
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function sliderBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  const model = sliderModel(widget);
  const label = clean(stringify(widget.props['label']));
  const state = formControlState(widget);
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(widget, label, state),
      ...sliderTrackSpans(widget, model),
      separatorSpan(widget),
      formSpan(widget, 'value', 'value.current', formatNumber(model.value), formValueStyle(widget, state))
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function rangeSliderBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  const model = rangeSliderModel(widget);
  const label = clean(stringify(widget.props['label']));
  const state = formControlState(widget);
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(widget, label, state),
      ...rangeSliderTrackSpans(widget, model),
      separatorSpan(widget),
      formSpan(widget, 'value', 'value.start', formatNumber(model.start), formValueStyle(widget, state)),
      formSpan(widget, 'separator', 'value.separator', '-'),
      formSpan(widget, 'value', 'value.end', formatNumber(model.end), formValueStyle(widget, state))
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function checkboxListBlock(widget: RenderNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) {
    lines.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget), {
      required: widget.props['required'] === true
    }), bounds.width));
  }
  const selected = selectedIds(widget);
  for (const option of formOptions(widget)) {
    const symbol = selected.has(option.id) ? theme.tokens.symbols.checkboxChecked : theme.tokens.symbols.checkboxUnchecked;
    const state = optionControlState(widget, {
      selected: selected.has(option.id),
      ...(option.disabled === undefined ? {} : { disabled: option.disabled })
    });
    lines.push(clippedFormLine([
      formSpan(widget, 'marker', selected.has(option.id) ? `option.${option.id}.marker.checked` : `option.${option.id}.marker.unchecked`, symbol, formMarkerStyle(widget, state)),
      separatorSpan(widget),
      formSpan(widget, 'option', `option.${option.id}.label`, option.label, optionStyle(option, widget))
    ], bounds.width));
  }
  lines.push(...errorLines(widget, bounds.width));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function radioGroupBlock(widget: RenderNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) {
    lines.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget), {
      required: widget.props['required'] === true
    }), bounds.width));
  }
  const selected = selectedId(widget);
  for (const option of formOptions(widget)) {
    const symbol = option.id === selected ? theme.tokens.symbols.radioChecked : theme.tokens.symbols.radioUnchecked;
    const state = optionControlState(widget, {
      selected: option.id === selected,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled })
    });
    lines.push(clippedFormLine([
      formSpan(widget, 'marker', option.id === selected ? `option.${option.id}.marker.selected` : `option.${option.id}.marker`, symbol, formMarkerStyle(widget, state)),
      separatorSpan(widget),
      formSpan(widget, 'option', `option.${option.id}.label`, option.label, optionStyle(option, widget))
    ], bounds.width));
  }
  lines.push(...errorLines(widget, bounds.width));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function colorPickerBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) rows.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget)), bounds.width));
  const selected = selectedColorOption(widget);
  if (selected !== undefined) rows.push(clippedFormLine(colorPickerSummarySpans(selected, widget), bounds.width));
  const columns = pickerColumns(widget, 4);
  const options = colorOptions(widget);
  for (let index = 0; index < options.length; index += columns) {
    rows.push(clippedFormLine(options.slice(index, index + columns).flatMap((option) => colorPickerSpans(option, widget)), bounds.width));
  }
  rows.push(...errorLines(widget, bounds.width));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function datePickerBlock(widget: RenderNode, bounds: Rect): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) rows.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget)), bounds.width));
  const columns = pickerColumns(widget, 7);
  if (columns === 7) rows.push(clippedFormLine(datePickerWeekdayHeaderSpans(widget), bounds.width));
  const days = datePickerDays(widget);
  for (let index = 0; index < days.length; index += columns) {
    rows.push(clippedFormLine(days.slice(index, index + columns).flatMap((day) => datePickerCellSpans(day, widget)), bounds.width));
  }
  rows.push(...errorLines(widget, bounds.width));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function selectBoxBlock(widget: RenderNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedOption(widget);
  const label = clean(stringify(widget.props['label']));
  const placeholder = clean(stringify(widget.props['placeholder'])) || 'Select…';
  const value = selected?.label ?? placeholder;
  const style = widget.props['disabled'] === true
    ? renderNodeStyle(widget, 'value', 'disabled')
    : selected === undefined
      ? renderNodeStyle(widget, 'placeholder')
      : renderNodeStyle(widget, 'value');
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(widget, label, formControlState(widget), {
        required: widget.props['required'] === true
      }),
      formSpan(widget, selected === undefined ? 'placeholder' : 'value', selected === undefined ? 'value.placeholder' : 'value.selected', value, style),
      separatorSpan(widget),
      formSpan(widget, 'chrome', 'chrome.dropdown', theme.tokens.symbols.treeCollapsed, formMarkerStyle(widget))
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function textInputBlock(widget: RenderNode, bounds: Rect, focused = false, theme: TerminalTheme): RenderBlock {
  return controlInputBlock(inputValue(widget), widget, bounds, focused, theme);
}

export function numberInputBlock(widget: RenderNode, bounds: Rect, focused = false, theme: TerminalTheme): RenderBlock {
  return controlInputBlock(numberInputValue(widget), widget, bounds, focused, theme);
}

export function formAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: formTitle(widget) || id,
    ...(focused ? { focused } : {})
  };
}

export function fieldAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function labelAccessibleBase(widget: RenderNode, id: string): AccessibleNode {
  const description = stringify(widget.props['forId']);
  return {
    id,
    role: 'text',
    label: labelText(widget) || id,
    ...(description.length === 0 ? {} : { description: `Labels ${description}.` }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {})
  };
}

export function buttonAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
  const description = buttonDescription(widget);
  return {
    id,
    role: 'button',
    label: clean(stringify(widget.props['label'])) || id,
    ...(widget.props['pending'] === true ? { value: 'pending' } : widget.props['pressed'] === true ? { value: 'pressed' } : {}),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function toggleSwitchAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function sliderAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function rangeSliderAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function checkboxListAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function checkboxListAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] {
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

export function radioGroupAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function radioGroupAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] {
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

export function colorPickerAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function colorPickerAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] {
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

export function datePickerAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function datePickerAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return datePickerDays(widget).map((day) => ({
    id: `${widget.id ?? 'datePicker'}:${day.id}`,
    role: 'option',
    label: day.label,
    selected: day.id === selected,
    ...(day.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function selectBoxAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
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

export function selectBoxAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] {
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

export function textInputAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, inputValue(widget));
}

export function numberInputAccessibleBase(widget: RenderNode, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, numberInputValue(widget));
}

export function textInputCursor(widget: RenderNode, bounds: Rect): CursorPosition {
  return singleLineCursor(widget, inputValue(widget), numberProp(widget, 'cursor'), bounds, defaultTheme);
}

export function numberInputCursor(widget: RenderNode, bounds: Rect): CursorPosition {
  return singleLineCursor(widget, numberInputValue(widget), numberProp(widget, 'cursor'), bounds, defaultTheme);
}

export function controlHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (!('message' in widget.props)) return [];
  const message = widget.props['message'] as TMessage;
  return [{
    id: `${widget.id ?? widget.kind}:control`,
    bounds,
    message: () => message,
    cursor: 'pointer'
  }];
}

export function optionHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
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
      message: () => toMessage(option),
      cursor: 'pointer'
    }];
  });
}

export function checkboxListHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
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
      message: () => toMessage(option, !selected.has(option.id)),
      cursor: 'pointer'
    }];
  });
}

export function sliderHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
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
    message: () => toMessage(value),
    cursor: 'pointer'
  }));
}

export function rangeSliderHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
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
    message: () => toMessage(rangeForClick(model, value)),
    cursor: 'pointer'
  }));
}

export function pickerHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = pickerMessageFactory(widget);
  if (toMessage === undefined) return [];
  const columns = pickerColumns(widget, widget.kind === 'datePicker' ? 7 : 4);
  const options = widget.kind === 'datePicker' ? datePickerDays(widget) : colorOptions(widget);
  const rowOffset = pickerOptionRowOffset(widget, columns);
  return options.flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${widget.id ?? widget.kind}:${option.id}`,
      bounds: {
        row: bounds.row + rowOffset + Math.floor(index / columns),
        column: bounds.column + (index % columns) * pickerCellWidth(widget),
        width: pickerCellWidth(widget),
        height: 1
      },
      message: () => toMessage(option),
      cursor: 'pointer'
    }];
  });
}

function controlInputBlock(value: string, widget: RenderNode, bounds: Rect, focused: boolean, theme: TerminalTheme): RenderBlock {
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

function inputAccessibleBase(widget: RenderNode, id: string, focused: boolean, value: string): AccessibleNode {
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

function fieldHeaderLines(widget: RenderNode): readonly (readonly RenderSpan[])[] {
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

function errorLines(widget: RenderNode, width: number): readonly RenderLine[] {
  const error = clean(stringify(widget.props['error']));
  return error.length === 0
    ? []
    : [clippedFormLine([formSpan(widget, 'error', 'validation.error', error, formErrorStyle(widget))], width)];
}

function clippedFormLine(spans: readonly RenderSpan[], width: number): RenderLine {
  return formLine(clipRenderSpans(spans, Math.max(0, width)));
}

function buttonSpans(widget: RenderNode, label: string, focused: boolean, theme: TerminalTheme): readonly RenderSpan[] {
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

function buttonStateMarker(widget: RenderNode, theme: TerminalTheme): string {
  if (widget.props['disabled'] === true) return '-';
  if (widget.props['pending'] === true) return theme.tokens.symbols.statusInfo;
  if (widget.props['pressed'] === true) return theme.tokens.symbols.selected;
  return buttonTone(widget) === 'destructive' ? theme.tokens.symbols.statusError : '';
}

function buttonStyle(widget: RenderNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(widget, focused);
  const base = buttonBaseStyle(widget);
  return resolveRenderNodeStyle(widget, {
    slot: 'label',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonChromeStyle(widget: RenderNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(widget, focused);
  const base = buttonChromeBaseStyle(widget);
  return resolveRenderNodeStyle(widget, {
    slot: 'border',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonBaseStyle(widget: RenderNode): TerminalStyle | undefined {
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

function buttonChromeBaseStyle(widget: RenderNode): TerminalStyle | undefined {
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

function controlToneStyle(tone: 'default' | 'primary' | 'secondary'): TerminalStyle {
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

function controlToneBorderStyle(tone: 'default' | 'primary' | 'secondary'): TerminalStyle {
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

function buttonState(widget: RenderNode, focused: boolean): RenderNodeVisualState | undefined {
  if (widget.props['disabled'] === true) return 'disabled';
  return focused ? 'focused' : undefined;
}

function buttonTone(widget: RenderNode): ButtonTone {
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

function buttonDescription(widget: RenderNode): string {
  const parts = [
    widget.props['pending'] === true ? 'Pending.' : '',
    widget.props['pressed'] === true ? 'Pressed.' : '',
    buttonTone(widget) === 'destructive' ? 'Destructive action.' : ''
  ].filter((part) => part.length > 0);
  return parts.join(' ');
}

function fieldDescription(widget: RenderNode): string {
  const parts = [
    clean(stringify(widget.props['description'])),
    widget.props['required'] === true ? 'Required.' : '',
    clean(stringify(widget.props['error']))
  ].filter((part) => part.length > 0);
  return parts.join(' ');
}

function formTitle(widget: RenderNode): string {
  return clean(stringify(widget.props['title']));
}

function labelText(widget: RenderNode): string {
  return labelWithRequired(clean(stringify(widget.props['text'])), widget.props['required'] === true);
}

function labelWithRequired(label: string, required: boolean): string {
  if (label.length === 0) return required ? 'Required' : '';
  return required ? `${label} *` : label;
}

function selectedId(widget: RenderNode): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedOption(widget: RenderNode): ChoiceItem<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : formOptions(widget).find((option) => option.id === selected);
}

function formOptions(widget: RenderNode): readonly ChoiceItem<unknown>[] {
  const options = widget.props['options'];
  return Array.isArray(options) ? options.flatMap((option): readonly ChoiceItem<unknown>[] => sanitizeOption(option)) : [];
}

function sanitizeOption(value: unknown): readonly ChoiceItem<unknown>[] {
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

function optionMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((option: ChoiceItem<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isOptionMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

function checkboxListMessageFactory<TMessage>(
  widget: RenderNode<TMessage>
): ((option: ChoiceItem<unknown>, checked: boolean) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isCheckboxListMessageFactory(toMessage)) return undefined;
  return (option, checked) => toMessage(option, checked) as TMessage;
}

function sliderMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((value: number) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isSliderMessageFactory(toMessage)) return undefined;
  return (value) => toMessage(value) as TMessage;
}

function rangeSliderMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((value: RangeSliderValue) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isRangeSliderMessageFactory(toMessage)) return undefined;
  return (value) => toMessage(value) as TMessage;
}

function pickerMessageFactory<TMessage>(widget: RenderNode<TMessage>): ((option: ColorPickerOption<unknown> | DatePickerDay<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isPickerMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

function optionStyle(option: ChoiceItem<unknown>, widget: RenderNode): TerminalStyle | undefined {
  if (option.disabled === true || widget.props['disabled'] === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (option.id === selectedId(widget)) return renderNodeStyle(widget, 'value', 'selected');
  return undefined;
}

function selectedIds(widget: RenderNode): ReadonlySet<string> {
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

function sliderModel(widget: RenderNode): SliderModel {
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

function rangeSliderModel(widget: RenderNode): RangeSliderModel {
  const base = sliderModel({ ...widget, props: { ...widget.props, value: widget.props['start'] } });
  const start = clampNumber(finiteNumber(widget.props['start'], base.min), base.min, base.max);
  const end = clampNumber(finiteNumber(widget.props['end'], base.max), base.min, base.max);
  return {
    ...base,
    start: Math.min(start, end),
    end: Math.max(start, end)
  };
}

function sliderTrackSpans(widget: RenderNode, model: SliderModel): readonly RenderSpan[] {
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

function rangeSliderTrackSpans(widget: RenderNode, model: RangeSliderModel): readonly RenderSpan[] {
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

function sliderPartStyle(widget: RenderNode, label: string, disabled: boolean): TerminalStyle | undefined {
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

function toggleValueStyle(widget: RenderNode, checked: boolean): TerminalStyle | undefined {
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

function colorOptions(widget: RenderNode): readonly ColorPickerOption<unknown>[] {
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

function selectedColorOption(widget: RenderNode): ColorPickerOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : colorOptions(widget).find((option) => option.id === selected);
}

function datePickerDays(widget: RenderNode): readonly DatePickerDay<unknown>[] {
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

function selectedDatePickerDay(widget: RenderNode): DatePickerDay<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : datePickerDays(widget).find((day) => day.id === selected);
}

function pickerColumns(widget: RenderNode, fallback: number): number {
  return Math.max(1, Math.floor(finiteNumber(widget.props['columns'], fallback)));
}

function pickerCellWidth(widget: RenderNode): number {
  return widget.kind === 'datePicker' ? 4 : 12;
}

function pickerOptionRowOffset(widget: RenderNode, columns: number): number {
  let offset = clean(stringify(widget.props['label'])).length > 0 ? 1 : 0;
  if (widget.kind === 'colorPicker' && selectedColorOption(widget) !== undefined) offset += 1;
  if (widget.kind === 'datePicker' && columns === 7) offset += 1;
  return offset;
}

function colorPickerSummarySpans(option: ColorPickerOption<unknown>, widget: RenderNode): readonly RenderSpan[] {
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

function colorPickerSpans(option: ColorPickerOption<unknown>, widget: RenderNode): readonly RenderSpan[] {
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

function colorSwatchStyle(widget: RenderNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    base: {
      fg: { kind: 'theme', token: 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.primary.background' }
    }
  });
}

function datePickerWeekdayHeaderSpans(widget: RenderNode): readonly RenderSpan[] {
  return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) =>
    formSpan(widget, 'weekday', `weekday.${label.toLowerCase()}`, ` ${label} `, formLabelStyle(widget, 'disabled'))
  );
}

function datePickerCellSpans(day: DatePickerDay<unknown>, widget: RenderNode): readonly RenderSpan[] {
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

function datePickerDayStyle(day: DatePickerDay<unknown>, widget: RenderNode): TerminalStyle | undefined {
  if (day.disabled === true || widget.props['disabled'] === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (day.id === selectedId(widget)) return renderNodeStyle(widget, 'value', 'selected');
  if (day.today === true) return renderNodeStyle(widget, 'value', 'focused');
  if (day.outsideMonth === true) return renderNodeStyle(widget, 'value', 'disabled');
  return undefined;
}

function datePickerDayState(day: DatePickerDay<unknown>, widget: RenderNode): 'selected' | 'disabled' | 'focused' | undefined {
  if (day.disabled === true || widget.props['disabled'] === true || day.outsideMonth === true) return 'disabled';
  if (day.id === selectedId(widget)) return 'selected';
  return day.today === true ? 'focused' : undefined;
}

function inputValue(widget: RenderNode): string {
  return clean(stringify(widget.props['value']));
}

function numberInputValue(widget: RenderNode): string {
  const value = widget.props['value'];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function singleLineCursor(widget: RenderNode, value: string, cursor: number | undefined, bounds: Rect, theme: TerminalTheme): CursorPosition {
  return singleLineInputCursor({
    widget,
    bounds,
    theme,
    value,
    focused: true,
    ...(cursor === undefined ? {} : { cursor })
  });
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

function isOptionMessageFactory(value: unknown): value is (option: ChoiceItem<unknown>) => unknown {
  return typeof value === 'function';
}

function isCheckboxListMessageFactory(
  value: unknown
): value is (option: ChoiceItem<unknown>, checked: boolean) => unknown {
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
