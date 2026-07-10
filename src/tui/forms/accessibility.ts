import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNode } from '../../render-node/index.ts';
import { defaultTheme } from '../../theme/index.ts';
import { stringify, numberProp } from '../render-node-props.ts';
import type { CursorPosition } from '../cursor.ts';
import type { Rect } from '../layout.ts';
import {
  buttonDescription,
  clean,
  colorOptions,
  datePickerDays,
  fieldDescription,
  formOptions,
  formTitle,
  formatNumber,
  inputAccessibleBase,
  inputValue,
  labelText,
  labelWithRequired,
  numberInputValue,
  rangeSliderModel,
  selectedColorOption,
  selectedDatePickerDay,
  selectedId,
  selectedIds,
  selectedOption,
  singleLineCursor,
  sliderModel
} from './support.ts';

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
