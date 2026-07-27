import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind, RenderNodesOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import { stringify, numberProp } from '../render-node-props.ts';
import type { CursorPosition } from '../../model/cursor.ts';
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
type TextInputNode = RenderNodesOfKind<unknown, 'textInput' | 'passwordInput'>;
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

export function formAccessibleBase(renderNode: FormNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'form',
    label: formTitle(renderNode) || id,
    ...(focused ? { focused } : {})
  };
}

export function fieldAccessibleBase(renderNode: FieldNode, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(renderNode);
  return {
    id,
    role: 'group',
    label: labelWithRequired(clean(stringify(renderNode.props.label)), renderNode.props.required === true) || id,
    ...(description.length === 0 ? {} : { description }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function labelAccessibleBase(renderNode: LabelNode, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: labelText(renderNode) || id,
    ...(renderNode.props.disabled === true ? { disabled: true } : {})
  };
}

export function buttonAccessibleBase(renderNode: ButtonNode, id: string, focused: boolean): AccessibleNode {
  const description = buttonDescription(renderNode);
  return {
    id,
    role: 'button',
    label: clean(stringify(renderNode.props.label)) || id,
    ...(renderNode.props.state === 'pending' ? { value: 'pending' } : {}),
    ...(description.length === 0 ? {} : { description }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxAccessibleBase(renderNode: CheckboxNode, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(renderNode);
  return {
    id,
    role: 'checkbox',
    label: labelWithRequired(clean(stringify(renderNode.props.label)), renderNode.props.required === true) || id,
    checked: renderNode.props.checked,
    ...(description.length === 0 ? {} : { description }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function toggleSwitchAccessibleBase(renderNode: ToggleSwitchNode, id: string, focused: boolean): AccessibleNode {
  const onLabel = clean(stringify(renderNode.props.onLabel)) || 'On';
  const offLabel = clean(stringify(renderNode.props.offLabel)) || 'Off';
  const checked = renderNode.props.checked;
  return {
    id,
    role: 'switch',
    label: clean(stringify(renderNode.props.label)) || id,
    value: checked ? onLabel : offLabel,
    checked,
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function sliderAccessibleBase(renderNode: SliderNode, id: string, focused: boolean): AccessibleNode {
  const model = sliderModel(renderNode);
  return {
    id,
    role: 'slider',
    label: clean(stringify(renderNode.props.label)) || id,
    value: formatNumber(model.value),
    numericValue: { current: model.value, minimum: model.min, maximum: model.max },
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function rangeSliderAccessibleBase(renderNode: RangeSliderNode, id: string, focused: boolean): AccessibleNode {
  const model = rangeSliderModel(renderNode);
  const label = clean(stringify(renderNode.props.label)) || id;
  return {
    id,
    role: 'group',
    label,
    value: `${formatNumber(model.start)}-${formatNumber(model.end)}`,
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {}),
    children: (['start', 'end'] as const).map((handle) => ({
      id: `${id}:${handle}`,
      role: 'slider',
      label: `${label} ${handle}`,
      value: formatNumber(handle === 'start' ? model.start : model.end),
      numericValue: {
        current: handle === 'start' ? model.start : model.end,
        minimum: model.min,
        maximum: model.max
      },
      ...(renderNode.props.disabled === true ? { disabled: true } : {}),
      ...(focused && model.activeHandle === handle ? { focused: true } : {})
    }))
  };
}

export function checkboxGroupAccessibleBase(renderNode: CheckboxGroupNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedIds(renderNode);
  return {
    id,
    role: 'group',
    label: labelWithRequired(clean(stringify(renderNode.props.label)), renderNode.props.required === true) || id,
    value: `${String(selected.size)} selected`,
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxGroupAccessibleChildren(renderNode: CheckboxGroupNode): readonly AccessibleNode[] {
  const selected = selectedIds(renderNode);
  return formOptions(renderNode).map((option) => ({
    id: `${renderNode.id ?? 'checkboxGroup'}:${option.id}`,
    role: 'checkbox',
    label: option.label,
    checked: selected.has(option.id),
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || renderNode.props.disabled === true ? { disabled: true } : {})
  }));
}

export function radioGroupAccessibleBase(renderNode: RadioGroupNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(renderNode);
  const description = fieldDescription(renderNode);
  return {
    id,
    role: 'radiogroup',
    label: labelWithRequired(clean(stringify(renderNode.props.label)), renderNode.props.required === true) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function radioGroupAccessibleChildren(renderNode: RadioGroupNode): readonly AccessibleNode[] {
  const selected = selectedId(renderNode);
  return formOptions(renderNode).map((option) => ({
    id: `${renderNode.id ?? 'radioGroup'}:${option.id}`,
    role: 'radio',
    label: option.label,
    checked: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || renderNode.props.disabled === true ? { disabled: true } : {})
  }));
}

export function colorSwatchPickerAccessibleBase(renderNode: ColorSwatchPickerNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedColorOption(renderNode);
  return {
    id,
    role: 'listbox',
    label: clean(stringify(renderNode.props.label)) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function colorSwatchPickerAccessibleChildren(renderNode: ColorSwatchPickerNode): readonly AccessibleNode[] {
  const selected = selectedId(renderNode);
  return colorOptions(renderNode).map((option) => ({
    id: `${renderNode.id ?? 'colorSwatchPicker'}:${option.id}`,
    role: 'option',
    label: option.label,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || renderNode.props.disabled === true ? { disabled: true } : {})
  }));
}

export function calendarAccessibleBase(renderNode: CalendarNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedCalendarDay(renderNode);
  return {
    id,
    role: 'grid',
    label: clean(stringify(renderNode.props.label)) || clean(stringify(renderNode.props.monthLabel)) || id,
    ...(selected === undefined ? {} : { value: selected.id }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function calendarAccessibleChildren(renderNode: CalendarNode): readonly AccessibleNode[] {
  const selected = selectedId(renderNode);
  const days = calendarDays(renderNode).filter((day) => day.hidden !== true);
  const rows: AccessibleNode[] = [];
  for (let startIndex = 0; startIndex < days.length; startIndex += 7) {
    const rowIndex = Math.floor(startIndex / 7) + 1;
    rows.push({
      id: `${renderNode.id ?? 'calendar'}:week:${String(rowIndex)}`,
      role: 'row',
      position: { rowIndex, rowCount: Math.ceil(days.length / 7), columnCount: 7 },
      children: days.slice(startIndex, startIndex + 7).map((day, columnIndex) => ({
        id: `${renderNode.id ?? 'calendar'}:${day.id}`,
        role: 'gridcell',
        label: day.id,
        selected: day.id === selected,
        position: { rowIndex, columnIndex: columnIndex + 1, columnCount: 7 },
        ...(day.disabled === true || renderNode.props.disabled === true ? { disabled: true } : {})
      }))
    });
  }
  return rows;
}

export function selectAccessibleBase(renderNode: SelectNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(renderNode);
  const description = fieldDescription(renderNode);
  return {
    id,
    role: 'combobox',
    label: labelWithRequired(clean(stringify(renderNode.props.label)), renderNode.props.required === true) || id,
    expanded: renderNode.props.presentation.kind === 'open',
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function selectAccessibleChildren(renderNode: SelectNode): readonly AccessibleNode[] {
  if (renderNode.props.presentation.kind !== 'open') return [];
  const selected = selectedId(renderNode);
  const highlighted = renderNode.props.presentation.highlighted;
  const id = renderNode.id ?? 'select';
  return [{
    id: `${id}:options`,
    role: 'listbox',
    label: `${clean(stringify(renderNode.props.label)) || id} options`,
    children: formOptions(renderNode).map((option) => ({
      id: `${id}:${option.id}`,
      role: 'option',
      label: option.label,
      selected: option.id === selected,
      ...(option.id === highlighted ? { focused: true } : {}),
      ...(option.description === undefined ? {} : { description: option.description }),
      ...(option.disabled === true || renderNode.props.disabled === true ? { disabled: true } : {})
    }))
  }];
}

export function textInputAccessibleBase(renderNode: TextInputNode, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(renderNode, id, focused, inputValue(renderNode));
}

export function passwordInputAccessibleBase(renderNode: TextInputNode, id: string, focused: boolean): AccessibleNode {
  const accessible = inputAccessibleBase(renderNode, id, focused, '');
  return {
    id,
    role: 'textbox',
    label: id,
    ...(accessible.disabled === undefined ? {} : { disabled: accessible.disabled }),
    ...(accessible.focused === undefined ? {} : { focused: accessible.focused }),
    description: [accessible.description, 'Password input.'].filter(Boolean).join(' ')
  };
}

export function numberInputAccessibleBase(renderNode: NumberInputNode, id: string, focused: boolean): AccessibleNode {
  const base = inputAccessibleBase(renderNode, id, focused, numberInputValue(renderNode));
  const validity = clean(stringify(renderNode.props.presentation.validity));
  const committed = renderNode.props.presentation.committedValue;
  const description = [
    base.description,
    validity.length === 0 ? undefined : `Numeric input is ${validity}.`,
    typeof committed === 'number' && Number.isFinite(committed) ? `Committed value: ${formatNumber(committed)}.` : undefined
  ].filter((part): part is string => part !== undefined).join(' ');
  const value = numberInputValue(renderNode);
  const current = Number(value);
  return {
    ...base,
    role: 'spinbutton',
    ...(Number.isFinite(current) ? {
      numericValue: {
        current,
        ...(typeof renderNode.props.presentation.min === 'number' ? { minimum: renderNode.props.presentation.min } : {}),
        ...(typeof renderNode.props.presentation.max === 'number' ? { maximum: renderNode.props.presentation.max } : {})
      }
    } : {}),
    ...(description.length === 0 ? {} : { description })
  };
}

export function textInputCursor(
  renderNode: TextInputNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): CursorPosition {
  return singleLineCursor(renderNode, inputValue(renderNode), numberProp(renderNode, 'cursor'), bounds, theme, widthProfile);
}

export function numberInputCursor(
  renderNode: NumberInputNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): CursorPosition {
  const layout = numberInputLayout(bounds);
  const inputBounds = renderNode.props.toActionMessage === undefined || renderNode.props.disabled === true || layout === undefined
    ? bounds
    : layout.input;
  return singleLineCursor(renderNode, numberInputValue(renderNode), renderNode.props.presentation.cursor, inputBounds, theme, widthProfile);
}
