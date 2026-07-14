import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import { defaultTheme } from '../../../theme/index.ts';
import { stringify, numberProp } from '../render-node-props.ts';
import type { CursorPosition } from '../../model/cursor.ts';

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
import type { Rect } from '../../model/layout.ts';
import {
  buttonDescription,
} from './support/button.ts';
import {
  formOptions,
  selectedId,
  selectedIds,
  selectedOption
} from './support/choices.ts';
import {
  colorOptions,
  calendarDays,
  selectedColorOption,
  selectedCalendarDay
} from './support/pickers.ts';
import {
  rangeSliderModel,
  sliderModel
} from './support/sliders.ts';
import {
  clean,
  fieldDescription,
  formTitle,
  formatNumber,
  inputAccessibleBase,
  inputValue,
  labelText,
  labelWithRequired,
  numberInputValue,
  singleLineCursor,
} from './support/shared.ts';
import { numberInputLayout } from './support/number-input.ts';

export function formAccessibleBase(widget: FormNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: formTitle(widget) || id,
    ...(focused ? { focused } : {})
  };
}

export function fieldAccessibleBase(widget: FieldNode, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'text',
    label: labelWithRequired(clean(stringify(widget.props.label)), widget.props.required === true) || id,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function labelAccessibleBase(widget: LabelNode, id: string): AccessibleNode {
  const description = stringify(widget.props.forId);
  return {
    id,
    role: 'text',
    label: labelText(widget) || id,
    ...(description.length === 0 ? {} : { description: `Labels ${description}.` }),
    ...(widget.props.disabled === true ? { disabled: true } : {})
  };
}

export function buttonAccessibleBase(widget: ButtonNode, id: string, focused: boolean): AccessibleNode {
  const description = buttonDescription(widget);
  return {
    id,
    role: 'button',
    label: clean(stringify(widget.props.label)) || id,
    ...(widget.props.state === 'pending' ? { value: 'pending' } : {}),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxAccessibleBase(widget: CheckboxNode, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'checkbox',
    label: labelWithRequired(clean(stringify(widget.props.label)), widget.props.required === true) || id,
    checked: widget.props.checked,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function toggleSwitchAccessibleBase(widget: ToggleSwitchNode, id: string, focused: boolean): AccessibleNode {
  const onLabel = clean(stringify(widget.props.onLabel)) || 'On';
  const offLabel = clean(stringify(widget.props.offLabel)) || 'Off';
  const checked = widget.props.checked;
  return {
    id,
    role: 'checkbox',
    label: clean(stringify(widget.props.label)) || id,
    value: checked ? onLabel : offLabel,
    checked,
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function sliderAccessibleBase(widget: SliderNode, id: string, focused: boolean): AccessibleNode {
  const model = sliderModel(widget);
  return {
    id,
    role: 'progressbar',
    label: clean(stringify(widget.props.label)) || id,
    value: formatNumber(model.value),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function rangeSliderAccessibleBase(widget: RangeSliderNode, id: string, focused: boolean): AccessibleNode {
  const model = rangeSliderModel(widget);
  const label = clean(stringify(widget.props.label)) || id;
  return {
    id,
    role: 'group',
    label,
    value: `${formatNumber(model.start)}-${formatNumber(model.end)}`,
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {}),
    children: (['start', 'end'] as const).map((handle) => ({
      id: `${id}:${handle}`,
      role: 'progressbar',
      label: `${label} ${handle}`,
      value: formatNumber(handle === 'start' ? model.start : model.end),
      selected: model.activeHandle === handle,
      ...(widget.props.disabled === true ? { disabled: true } : {}),
      ...(focused && model.activeHandle === handle ? { focused: true } : {})
    }))
  };
}

export function checkboxGroupAccessibleBase(widget: CheckboxGroupNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedIds(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props.label)), widget.props.required === true) || id,
    value: `${String(selected.size)} selected`,
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxGroupAccessibleChildren(widget: CheckboxGroupNode): readonly AccessibleNode[] {
  const selected = selectedIds(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'checkboxGroup'}:${option.id}`,
    role: 'checkbox',
    label: option.label,
    checked: selected.has(option.id),
    selected: selected.has(option.id),
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props.disabled === true ? { disabled: true } : {})
  }));
}

export function radioGroupAccessibleBase(widget: RadioGroupNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(widget);
  const description = fieldDescription(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props.label)), widget.props.required === true) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function radioGroupAccessibleChildren(widget: RadioGroupNode): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'radioGroup'}:${option.id}`,
    role: 'radio',
    label: option.label,
    checked: option.id === selected,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props.disabled === true ? { disabled: true } : {})
  }));
}

export function colorSwatchPickerAccessibleBase(widget: ColorSwatchPickerNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedColorOption(widget);
  return {
    id,
    role: 'listbox',
    label: clean(stringify(widget.props.label)) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function colorSwatchPickerAccessibleChildren(widget: ColorSwatchPickerNode): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return colorOptions(widget).map((option) => ({
    id: `${widget.id ?? 'colorSwatchPicker'}:${option.id}`,
    role: 'option',
    label: option.label,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props.disabled === true ? { disabled: true } : {})
  }));
}

export function calendarAccessibleBase(widget: CalendarNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedCalendarDay(widget);
  return {
    id,
    role: 'table',
    label: clean(stringify(widget.props.label)) || clean(stringify(widget.props.monthLabel)) || id,
    ...(selected === undefined ? {} : { value: selected.id }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function calendarAccessibleChildren(widget: CalendarNode): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return calendarDays(widget).filter((day) => day.hidden !== true).map((day) => ({
    id: `${widget.id ?? 'calendar'}:${day.id}`,
    role: 'option',
    label: day.id,
    selected: day.id === selected,
    ...(day.disabled === true || widget.props.disabled === true ? { disabled: true } : {})
  }));
}

export function selectAccessibleBase(widget: SelectNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(widget);
  const description = fieldDescription(widget);
  return {
    id,
    role: 'combobox',
    label: labelWithRequired(clean(stringify(widget.props.label)), widget.props.required === true) || id,
    expanded: widget.props.presentation.kind === 'open',
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function selectAccessibleChildren(widget: SelectNode): readonly AccessibleNode[] {
  if (widget.props.presentation.kind !== 'open') return [];
  const selected = selectedId(widget);
  const highlighted = widget.props.presentation.highlighted;
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'select'}:${option.id}`,
    role: 'option',
    label: option.label,
    selected: option.id === selected,
    ...(option.id === highlighted ? { focused: true } : {}),
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props.disabled === true ? { disabled: true } : {})
  }));
}

export function textInputAccessibleBase(widget: TextInputNode, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, inputValue(widget));
}

export function numberInputAccessibleBase(widget: NumberInputNode, id: string, focused: boolean): AccessibleNode {
  const base = inputAccessibleBase(widget, id, focused, numberInputValue(widget));
  const validity = clean(stringify(widget.props.presentation.validity));
  const committed = widget.props.presentation.committedValue;
  const description = [
    base.description,
    validity.length === 0 ? undefined : `Numeric input is ${validity}.`,
    typeof committed === 'number' && Number.isFinite(committed) ? `Committed value: ${formatNumber(committed)}.` : undefined
  ].filter((part): part is string => part !== undefined).join(' ');
  return { ...base, ...(description.length === 0 ? {} : { description }) };
}

export function textInputCursor(widget: TextInputNode, bounds: Rect): CursorPosition {
  return singleLineCursor(widget, inputValue(widget), numberProp(widget, 'cursor'), bounds, defaultTheme);
}

export function numberInputCursor(widget: NumberInputNode, bounds: Rect): CursorPosition {
  const layout = numberInputLayout(bounds);
  const inputBounds = widget.props.toActionMessage === undefined || widget.props.disabled === true || layout === undefined
    ? bounds
    : layout.input;
  return singleLineCursor(widget, numberInputValue(widget), widget.props.presentation.cursor, inputBounds, defaultTheme);
}
