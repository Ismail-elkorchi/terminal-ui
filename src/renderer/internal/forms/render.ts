import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';

type FormNode = RenderNodeOfKind<unknown, 'form'>;
type FieldNode = RenderNodeOfKind<unknown, 'field'>;
type LabelNode = RenderNodeOfKind<unknown, 'label'>;
type ButtonNode = RenderNodeOfKind<unknown, 'button'>;
type CheckboxNode = RenderNodeOfKind<unknown, 'checkbox'>;
type ToggleSwitchNode = RenderNodeOfKind<unknown, 'toggleSwitch'>;
type SliderNode = RenderNodeOfKind<unknown, 'slider'>;
type RangeSliderNode = RenderNodeOfKind<unknown, 'rangeSlider'>;
type CheckboxGroupNode = RenderNodeOfKind<unknown, 'checkboxGroup'>;
type RadioGroupNode = RenderNodeOfKind<unknown, 'radioGroup'>;
type ColorSwatchPickerNode = RenderNodeOfKind<unknown, 'colorSwatchPicker'>;
type CalendarNode = RenderNodeOfKind<unknown, 'calendar'>;
type SelectNode = RenderNodeOfKind<unknown, 'select'>;
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
import { mergeStyles, renderNodeStyle, themeStyle } from '../render-node-style.ts';
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
  colorSwatchPickerSpans,
  colorSwatchPickerSummarySpans,
  calendarCellSpans,
  calendarDays,
  calendarMonthHeaderSpans,
  calendarWeekdayHeaderSpans,
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
import { interactionVisualState } from '../pointer-interaction.ts';
import { controlTargetId } from './hit-targets.ts';

export function formContentBounds(renderNode: FormNode, bounds: Rect): Rect {
  const titleRows = formTitle(renderNode).length === 0 ? 0 : 1;
  return {
    row: bounds.row + titleRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleRows)
  };
}

export function fieldContentBounds(renderNode: FieldNode, bounds: Rect): Rect {
  const headerRows = fieldHeaderLines(renderNode).length;
  return {
    row: bounds.row + headerRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - headerRows)
  };
}

export function formBlock(renderNode: FormNode, bounds: Rect, widthProfile: TextWidthProfile): RenderBlock {
  const title = formTitle(renderNode);
  if (title.length === 0 || bounds.height <= 0) return block([]);
  return block([clippedFormLine([
    formSpan(renderNode, 'title', 'form.title', title, renderNodeStyle(renderNode, 'title'))
  ], bounds.width, widthProfile)]);
}

export function fieldBlock(renderNode: FieldNode, bounds: Rect, widthProfile: TextWidthProfile): RenderBlock {
  return block(fieldHeaderLines(renderNode).slice(0, Math.max(0, bounds.height)).map((item) =>
    clippedFormLine(item, bounds.width, widthProfile)
  ));
}

export function labelBlock(renderNode: LabelNode, bounds: Rect, widthProfile: TextWidthProfile): RenderBlock {
  return block([clippedFormLine(labelSpans(
    renderNode,
    'label',
    clean(stringify(renderNode.props.text)),
    renderNode.props.disabled === true ? 'disabled' : undefined,
    renderNode.props.required === true
  ), bounds.width, widthProfile)]);
}

export function buttonBlock(
  renderNode: ButtonNode,
  bounds: Rect,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const label = clean(stringify(renderNode.props.label)) || 'Button';
  return block([clippedFormLine(buttonSpans(renderNode, label, focused, theme), bounds.width, widthProfile)]);
}

export function checkboxBlock(
  renderNode: CheckboxNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const checked = renderNode.props.checked;
  const symbol = checked ? theme.tokens.symbols.checkboxChecked : theme.tokens.symbols.checkboxUnchecked;
  const state = interactionVisualState(renderNode, controlTargetId(renderNode), {
    disabled: renderNode.props.disabled === true,
    focused
  });
  const lines = [
    clippedFormLine([
      formSpan(
        renderNode,
        'marker',
        checked ? 'marker.checked' : 'marker.unchecked',
        symbol,
        mergeStyles(checked ? themeStyle('accent.primary', { bold: true }) : undefined, formMarkerStyle(renderNode, state)),
        state
      ),
      separatorSpan(renderNode),
      ...labelSpans(renderNode, 'label', clean(stringify(renderNode.props.label)), state, renderNode.props.required === true)
    ], bounds.width, widthProfile),
    ...errorLines(renderNode, bounds.width, widthProfile)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function toggleSwitchBlock(
  renderNode: ToggleSwitchNode,
  bounds: Rect,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const checked = renderNode.props.checked;
  const label = clean(stringify(renderNode.props.label));
  const onLabel = clean(stringify(renderNode.props.onLabel)) || 'On';
  const offLabel = clean(stringify(renderNode.props.offLabel)) || 'Off';
  const state = interactionVisualState(renderNode, controlTargetId(renderNode), {
    disabled: renderNode.props.disabled === true,
    focused
  });
  const lines = [
    clippedFormLine([
      ...controlPrefixSpans(renderNode, label, state),
      ...(checked
        ? [
            formSpan(renderNode, 'chrome', 'value.on.open', '[', formMarkerStyle(renderNode, state), state),
            separatorSpan(renderNode),
            formSpan(renderNode, 'value', 'value.on', onLabel, mergeStyles(toggleValueStyle(renderNode, true), renderNodeStyle(renderNode, 'value', state)), state),
            separatorSpan(renderNode),
            formSpan(renderNode, 'chrome', 'value.on.close', ']', formMarkerStyle(renderNode, state), state),
            separatorSpan(renderNode),
            formSpan(renderNode, 'placeholder', 'value.off', offLabel, formPlaceholderStyle(renderNode))
          ]
        : [
            formSpan(renderNode, 'placeholder', 'value.on', onLabel, formPlaceholderStyle(renderNode)),
            separatorSpan(renderNode),
            formSpan(renderNode, 'chrome', 'value.off.open', '[', formMarkerStyle(renderNode, state), state),
            separatorSpan(renderNode),
            formSpan(renderNode, 'value', 'value.off', offLabel, mergeStyles(toggleValueStyle(renderNode, false), renderNodeStyle(renderNode, 'value', state)), state),
            separatorSpan(renderNode),
            formSpan(renderNode, 'chrome', 'value.off.close', ']', formMarkerStyle(renderNode, state), state)
          ])
    ], bounds.width, widthProfile),
    ...errorLines(renderNode, bounds.width, widthProfile)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function sliderBlock(renderNode: SliderNode, bounds: Rect, widthProfile: TextWidthProfile): RenderBlock {
  const model = sliderModel(renderNode);
  const label = clean(stringify(renderNode.props.label));
  const state = formControlState(renderNode);
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(renderNode, label, state),
      ...sliderTrackSpans(renderNode, model, widthProfile),
      separatorSpan(renderNode),
      formSpan(renderNode, 'value', 'value.current', formatNumber(model.value), formValueStyle(renderNode, state))
    ], bounds.width, widthProfile),
    ...errorLines(renderNode, bounds.width, widthProfile)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function rangeSliderBlock(renderNode: RangeSliderNode, bounds: Rect, widthProfile: TextWidthProfile): RenderBlock {
  const model = rangeSliderModel(renderNode);
  const label = clean(stringify(renderNode.props.label));
  const state = formControlState(renderNode);
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(renderNode, label, state),
      ...rangeSliderTrackSpans(renderNode, model, widthProfile),
      separatorSpan(renderNode),
      formSpan(renderNode, 'value', 'value.start', formatNumber(model.start), formValueStyle(renderNode, state)),
      formSpan(renderNode, 'separator', 'value.separator', '-'),
      formSpan(renderNode, 'value', 'value.end', formatNumber(model.end), formValueStyle(renderNode, state))
    ], bounds.width, widthProfile),
    ...errorLines(renderNode, bounds.width, widthProfile)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function checkboxGroupBlock(
  renderNode: CheckboxGroupNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(renderNode.props.label));
  if (label.length > 0) {
    lines.push(clippedFormLine(controlLabelSpans(renderNode, label, formControlState(renderNode), {
      required: renderNode.props.required === true
    }), bounds.width, widthProfile));
  }
  const selected = selectedIds(renderNode);
  for (const option of formOptions(renderNode)) {
    const symbol = selected.has(option.id) ? theme.tokens.symbols.checkboxChecked : theme.tokens.symbols.checkboxUnchecked;
    const state = optionControlState(renderNode, {
      selected: selected.has(option.id),
      ...(option.disabled === undefined ? {} : { disabled: option.disabled })
    });
    lines.push(clippedFormLine([
      formSpan(renderNode, 'marker', selected.has(option.id) ? `option.${option.id}.marker.checked` : `option.${option.id}.marker.unchecked`, symbol, formMarkerStyle(renderNode, state)),
      separatorSpan(renderNode),
      formSpan(renderNode, 'option', `option.${option.id}.label`, option.label, optionStyle(option, renderNode))
    ], bounds.width, widthProfile));
  }
  lines.push(...errorLines(renderNode, bounds.width, widthProfile));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function radioGroupBlock(
  renderNode: RadioGroupNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(renderNode.props.label));
  if (label.length > 0) {
    lines.push(clippedFormLine(controlLabelSpans(renderNode, label, formControlState(renderNode), {
      required: renderNode.props.required === true
    }), bounds.width, widthProfile));
  }
  const selected = selectedId(renderNode);
  for (const option of formOptions(renderNode)) {
    const symbol = option.id === selected ? theme.tokens.symbols.radioChecked : theme.tokens.symbols.radioUnchecked;
    const state = optionControlState(renderNode, {
      selected: option.id === selected,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled })
    });
    lines.push(clippedFormLine([
      formSpan(renderNode, 'marker', option.id === selected ? `option.${option.id}.marker.selected` : `option.${option.id}.marker`, symbol, formMarkerStyle(renderNode, state)),
      separatorSpan(renderNode),
      formSpan(renderNode, 'option', `option.${option.id}.label`, option.label, optionStyle(option, renderNode))
    ], bounds.width, widthProfile));
  }
  lines.push(...errorLines(renderNode, bounds.width, widthProfile));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function colorSwatchPickerBlock(
  renderNode: ColorSwatchPickerNode,
  bounds: Rect,
  widthProfile: TextWidthProfile
): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(renderNode.props.label));
  if (label.length > 0) rows.push(clippedFormLine(
    controlLabelSpans(renderNode, label, formControlState(renderNode)),
    bounds.width,
    widthProfile
  ));
  const selected = selectedColorOption(renderNode);
  if (selected !== undefined) rows.push(clippedFormLine(
    colorSwatchPickerSummarySpans(selected, renderNode, widthProfile),
    bounds.width,
    widthProfile
  ));
  const columns = pickerColumns(renderNode, 4);
  const options = colorOptions(renderNode);
  for (let index = 0; index < options.length; index += columns) {
    rows.push(clippedFormLine(
      options.slice(index, index + columns).flatMap((option) => colorSwatchPickerSpans(option, renderNode, widthProfile)),
      bounds.width,
      widthProfile
    ));
  }
  rows.push(...errorLines(renderNode, bounds.width, widthProfile));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function calendarBlock(renderNode: CalendarNode, bounds: Rect, widthProfile: TextWidthProfile): RenderBlock {
  const rows: RenderLine[] = [];
  const label = clean(stringify(renderNode.props.label));
  if (label.length > 0) rows.push(clippedFormLine(
    controlLabelSpans(renderNode, label, formControlState(renderNode)),
    bounds.width,
    widthProfile
  ));
  const columns = 7;
  rows.push(clippedFormLine(calendarMonthHeaderSpans(renderNode), bounds.width, widthProfile));
  rows.push(clippedFormLine(calendarWeekdayHeaderSpans(renderNode, widthProfile), bounds.width, widthProfile));
  const days = calendarDays(renderNode);
  for (let index = 0; index < days.length; index += columns) {
    rows.push(clippedFormLine(
      days.slice(index, index + columns).flatMap((day) => calendarCellSpans(day, renderNode, widthProfile)),
      bounds.width,
      widthProfile
    ));
  }
  rows.push(...errorLines(renderNode, bounds.width, widthProfile));
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function selectBlock(
  renderNode: SelectNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const selected = selectedOption(renderNode);
  const label = clean(stringify(renderNode.props.label));
  const placeholder = clean(stringify(renderNode.props.placeholder)) || 'Select…';
  const value = selected?.label ?? placeholder;
  const style = renderNode.props.disabled === true
    ? renderNodeStyle(renderNode, 'option', 'disabled')
    : selected === undefined
      ? renderNodeStyle(renderNode, 'description')
      : renderNodeStyle(renderNode, 'option');
  const rows = [
    clippedFormLine([
      ...controlPrefixSpans(renderNode, label, formControlState(renderNode), {
        required: renderNode.props.required === true
      }),
      formSpan(renderNode, selected === undefined ? 'placeholder' : 'value', selected === undefined ? 'value.placeholder' : 'value.selected', value, style),
      separatorSpan(renderNode),
      formSpan(
        renderNode,
        'chrome',
        'chrome.dropdownMenu',
        renderNode.props.presentation.kind === 'open'
          ? theme.tokens.symbols.treeExpanded
          : theme.tokens.symbols.treeCollapsed,
        renderNodeStyle(renderNode, 'marker')
      )
    ], bounds.width, widthProfile),
    ...errorLines(renderNode, bounds.width, widthProfile)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function textInputBlock(
  renderNode: TextInputNode,
  bounds: Rect,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  return controlInputBlock(inputValue(renderNode), renderNode, bounds, focused, theme, widthProfile);
}

export function numberInputBlock(
  renderNode: NumberInputNode,
  bounds: Rect,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const layout = renderNode.props.toActionMessage === undefined || renderNode.props.disabled === true
    ? undefined
    : numberInputLayout(bounds);
  if (layout === undefined) return controlInputBlock(numberInputValue(renderNode), renderNode, bounds, focused, theme, widthProfile);
  const controls = [
    separatorSpan(renderNode),
    formSpan(renderNode, 'handle', 'step.decrement', '[-]', formMarkerStyle(renderNode)),
    separatorSpan(renderNode),
    formSpan(renderNode, 'handle', 'step.increment', '[+]', formMarkerStyle(renderNode))
  ];
  const input = controlInputBlock(numberInputValue(renderNode), renderNode, layout.input, focused, theme, widthProfile);
  const first = input.lines[0];
  return block([
    line([...(first === undefined ? [] : padRenderLine(first, layout.input.width, { widthProfile }).spans), ...controls]),
    ...input.lines.slice(1)
  ]);
}
