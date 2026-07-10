import type { RenderNodeOfKind, RenderNodesOfKind } from '../../render-node/index.ts';
import { stringify } from '../render-node-props.ts';
import type { Rect } from '../layout.ts';
import type { HitTarget } from '../render-node-renderer.ts';

type ActivationControlNode<TMessage> = RenderNodesOfKind<TMessage, 'button' | 'checkbox' | 'toggleSwitch'>;
type OptionControlNode<TMessage> = RenderNodesOfKind<TMessage, 'radioGroup' | 'selectBox'>;
type CheckboxListNode<TMessage> = RenderNodeOfKind<TMessage, 'checkboxList'>;
type SliderNode<TMessage> = RenderNodeOfKind<TMessage, 'slider'>;
type RangeSliderNode<TMessage> = RenderNodeOfKind<TMessage, 'rangeSlider'>;
type PickerNode<TMessage> = RenderNodesOfKind<TMessage, 'colorPicker' | 'datePicker'>;
import {
  checkboxListMessageFactory,
  formOptions,
  optionMessageFactory,
  selectedIds
} from './support/choices.ts';
import {
  colorOptions,
  datePickerDays,
  pickerCellWidth,
  pickerColumns,
  pickerMessageFactory,
  pickerOptionRowOffset
} from './support/pickers.ts';
import {
  rangeForClick,
  rangeSliderMessageFactory,
  rangeSliderModel,
  sliderMessageFactory,
  sliderModel,
  sliderValues
} from './support/sliders.ts';
import {
  clean,
  labelPrefix,
} from './support/shared.ts';

export function controlHitTargets<TMessage>(widget: ActivationControlNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (!('message' in widget.props)) return [];
  const message = widget.props.message;
  return [{
    id: `${widget.id ?? widget.kind}:control`,
    bounds,
    message: () => message,
    cursor: 'pointer'
  }];
}

export function optionHitTargets<TMessage>(widget: OptionControlNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = optionMessageFactory(widget);
  if (toMessage === undefined) return [];
  const labelOffset = clean(stringify(widget.props.label)).length > 0 ? 1 : 0;
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

export function checkboxListHitTargets<TMessage>(widget: CheckboxListNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = checkboxListMessageFactory(widget);
  if (toMessage === undefined) return [];
  const selected = selectedIds(widget);
  const labelOffset = clean(stringify(widget.props.label)).length > 0 ? 1 : 0;
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

export function sliderHitTargets<TMessage>(widget: SliderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = sliderMessageFactory(widget);
  if (toMessage === undefined) return [];
  const model = sliderModel(widget);
  return sliderValues(model).map((value, index) => ({
    id: `${widget.id ?? widget.kind}:value:${String(index)}`,
    bounds: {
      row: bounds.row,
      column: bounds.column + labelPrefix(clean(stringify(widget.props.label))).length + index,
      width: 1,
      height: 1
    },
    message: () => toMessage(value),
    cursor: 'pointer'
  }));
}

export function rangeSliderHitTargets<TMessage>(widget: RangeSliderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = rangeSliderMessageFactory(widget);
  if (toMessage === undefined) return [];
  const model = rangeSliderModel(widget);
  return sliderValues(model).map((value, index) => ({
    id: `${widget.id ?? widget.kind}:value:${String(index)}`,
    bounds: {
      row: bounds.row,
      column: bounds.column + labelPrefix(clean(stringify(widget.props.label))).length + index,
      width: 1,
      height: 1
    },
    message: () => toMessage(rangeForClick(model, value)),
    cursor: 'pointer'
  }));
}

export function pickerHitTargets<TMessage>(widget: PickerNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
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
