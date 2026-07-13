import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';

type FormNode = RenderNodeOfKind<unknown, 'form'>;
type FieldNode = RenderNodeOfKind<unknown, 'field'>;
type LabelNode = RenderNodeOfKind<unknown, 'label'>;
type ButtonNode = RenderNodeOfKind<unknown, 'button'>;
type CheckboxNode = RenderNodeOfKind<unknown, 'checkbox'>;
type ToggleSwitchNode = RenderNodeOfKind<unknown, 'toggleSwitch'>;
type SliderNode = RenderNodeOfKind<unknown, 'slider'>;
type RangeSliderNode = RenderNodeOfKind<unknown, 'rangeSlider'>;
type CheckboxListNode = RenderNodeOfKind<unknown, 'checkboxList'>;
type RadioGroupNode = RenderNodeOfKind<unknown, 'radioGroup'>;
type ColorPickerNode = RenderNodeOfKind<unknown, 'colorPicker'>;
type DatePickerNode = RenderNodeOfKind<unknown, 'datePicker'>;
type SelectBoxNode = RenderNodeOfKind<unknown, 'selectBox'>;
type TextInputNode = RenderNodeOfKind<unknown, 'textInput'>;
type NumberInputNode = RenderNodeOfKind<unknown, 'numberInput'>;
import { block, padRenderLine } from '../frame.ts';
import { line } from '../../../visual/render.ts';
import {
  controlLabelSpans,
  controlPrefixSpans,
  formControlState,
  formMarkerStyle,
  formPlaceholderStyle,
  formSpan,
  formValueStyle,
  labelSpans,
  optionControlState,
  separatorSpan
} from '../form-visual.ts';
import { renderNodeStyle } from '../render-node-style.ts';
import { stringify } from '../render-node-props.ts';
import type { RenderBlock, RenderLine } from '../frame.ts';
import type { Rect } from '../../model/layout.ts';
import {
  buttonSpans,
} from './support/button.ts';
import {
  formOptions,
  optionStyle,
  selectedId,
  selectedIds,
  selectedOption
} from './support/choices.ts';
import {
  colorOptions,
  colorPickerSpans,
  colorPickerSummarySpans,
  datePickerCellSpans,
  datePickerDays,
  datePickerMonthHeaderSpans,
  datePickerWeekdayHeaderSpans,
  pickerColumns,
  selectedColorOption
} from './support/pickers.ts';
import {
  rangeSliderModel,
  rangeSliderTrackSpans,
  sliderModel,
  sliderTrackSpans,
  toggleValueStyle
} from './support/sliders.ts';
import {
  clean,
  clippedFormLine,
  controlInputBlock,
  errorLines,
  fieldHeaderLines,
  formTitle,
  formatNumber,
  inputValue,
  numberInputValue,
} from './support/shared.ts';
import { numberInputLayout } from './support/number-input.ts';

export function formContentBounds(widget: FormNode, bounds: Rect): Rect {
  const titleRows = formTitle(widget).length === 0 ? 0 : 1;
  return {
    row: bounds.row + titleRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleRows)
  };
}

export function fieldContentBounds(widget: FieldNode, bounds: Rect): Rect {
  const headerRows = fieldHeaderLines(widget).length;
  return {
    row: bounds.row + headerRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - headerRows)
  };
}

export function formBlock(widget: FormNode, bounds: Rect): RenderBlock {
  const title = formTitle(widget);
  if (title.length === 0 || bounds.height <= 0) return block([]);
  return block([clippedFormLine([
    formSpan(widget, 'title', 'form.title', title, renderNodeStyle(widget, 'title'))
  ], bounds.width)]);
}

export function fieldBlock(widget: FieldNode, bounds: Rect): RenderBlock {
  return block(fieldHeaderLines(widget).slice(0, Math.max(0, bounds.height)).map((item) =>
    clippedFormLine(item, bounds.width)
  ));
}

export function labelBlock(widget: LabelNode, bounds: Rect): RenderBlock {
  return block([clippedFormLine(labelSpans(
    widget,
    'label',
    clean(stringify(widget.props.text)),
    widget.props.disabled === true ? 'disabled' : undefined,
    widget.props.required === true
  ), bounds.width)]);
}

export function buttonBlock(widget: ButtonNode, bounds: Rect, focused = false, theme: TerminalTheme): RenderBlock {
  const label = clean(stringify(widget.props.label)) || 'Button';
  return block([clippedFormLine(buttonSpans(widget, label, focused, theme), bounds.width)]);
}

export function checkboxBlock(widget: CheckboxNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const checked = widget.props.checked;
  const symbol = checked ? theme.tokens.symbols.checkboxChecked : theme.tokens.symbols.checkboxUnchecked;
  const state = formControlState(widget, checked);
  const lines = [
    clippedFormLine([
      formSpan(widget, 'marker', checked ? 'marker.checked' : 'marker.unchecked', symbol, formMarkerStyle(widget, state)),
      separatorSpan(widget),
      ...labelSpans(widget, 'label', clean(stringify(widget.props.label)), state, widget.props.required === true)
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function toggleSwitchBlock(widget: ToggleSwitchNode, bounds: Rect): RenderBlock {
  const checked = widget.props.checked;
  const label = clean(stringify(widget.props.label));
  const onLabel = clean(stringify(widget.props.onLabel)) || 'On';
  const offLabel = clean(stringify(widget.props.offLabel)) || 'Off';
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

export function sliderBlock(widget: SliderNode, bounds: Rect): RenderBlock {
  const model = sliderModel(widget);
  const label = clean(stringify(widget.props.label));
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

export function rangeSliderBlock(widget: RangeSliderNode, bounds: Rect): RenderBlock {
  const model = rangeSliderModel(widget);
  const label = clean(stringify(widget.props.label));
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

export function checkboxListBlock(widget: CheckboxListNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props.label));
  if (label.length > 0) {
    lines.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget), {
      required: widget.props.required === true
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

export function radioGroupBlock(widget: RadioGroupNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props.label));
  if (label.length > 0) {
    lines.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget), {
      required: widget.props.required === true
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

export function colorPickerBlock(widget: ColorPickerNode, bounds: Rect): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(widget.props.label));
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

export function datePickerBlock(widget: DatePickerNode, bounds: Rect): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(widget.props.label));
  if (label.length > 0) rows.push(clippedFormLine(controlLabelSpans(widget, label, formControlState(widget)), bounds.width));
  const columns = 7;
  rows.push(clippedFormLine(datePickerMonthHeaderSpans(widget), bounds.width));
  rows.push(clippedFormLine(datePickerWeekdayHeaderSpans(widget), bounds.width));
  const days = datePickerDays(widget);
  for (let index = 0; index < days.length; index += columns) {
    rows.push(clippedFormLine(days.slice(index, index + columns).flatMap((day) => datePickerCellSpans(day, widget)), bounds.width));
  }
  rows.push(...errorLines(widget, bounds.width));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function selectBoxBlock(widget: SelectBoxNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedOption(widget);
  const label = clean(stringify(widget.props.label));
  const placeholder = clean(stringify(widget.props.placeholder)) || 'Select…';
  const value = selected?.label ?? placeholder;
  const style = widget.props.disabled === true
    ? renderNodeStyle(widget, 'option', 'disabled')
    : selected === undefined
      ? renderNodeStyle(widget, 'description')
      : renderNodeStyle(widget, 'option');
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(widget, label, formControlState(widget), {
        required: widget.props.required === true
      }),
      formSpan(widget, selected === undefined ? 'placeholder' : 'value', selected === undefined ? 'value.placeholder' : 'value.selected', value, style),
      separatorSpan(widget),
      formSpan(widget, 'chrome', 'chrome.dropdown', theme.tokens.symbols.treeCollapsed, renderNodeStyle(widget, 'marker'))
    ], bounds.width),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function textInputBlock(widget: TextInputNode, bounds: Rect, focused = false, theme: TerminalTheme): RenderBlock {
  return controlInputBlock(inputValue(widget), widget, bounds, focused, theme);
}

export function numberInputBlock(widget: NumberInputNode, bounds: Rect, focused = false, theme: TerminalTheme): RenderBlock {
  const layout = widget.props.toActionMessage === undefined || widget.props.disabled === true
    ? undefined
    : numberInputLayout(bounds);
  if (layout === undefined) return controlInputBlock(numberInputValue(widget), widget, bounds, focused, theme);
  const controls = [
    separatorSpan(widget),
    formSpan(widget, 'handle', 'step.decrement', '[-]', formMarkerStyle(widget)),
    separatorSpan(widget),
    formSpan(widget, 'handle', 'step.increment', '[+]', formMarkerStyle(widget))
  ];
  const input = controlInputBlock(numberInputValue(widget), widget, layout.input, focused, theme);
  const first = input.lines[0];
  return block([
    line([...(first === undefined ? [] : padRenderLine(first, layout.input.width).spans), ...controls]),
    ...input.lines.slice(1)
  ]);
}
