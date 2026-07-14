import type { RenderNodeOfKind, RenderNodesOfKind } from '../../model/index.ts';
import { terminalTextWidth } from '../../../text/index.ts';
import { stringify } from '../render-node-props.ts';
import type { Rect } from '../../model/layout.ts';
import type { HitTarget } from '../../model/renderer.ts';

type ActivationControlNode<TMessage> = RenderNodesOfKind<TMessage, 'button' | 'checkbox' | 'toggleSwitch'>;
type OptionControlNode<TMessage> = RenderNodeOfKind<TMessage, 'radioGroup'>;
type CheckboxGroupNode<TMessage> = RenderNodeOfKind<TMessage, 'checkboxGroup'>;
type SliderNode<TMessage> = RenderNodeOfKind<TMessage, 'slider'>;
type RangeSliderNode<TMessage> = RenderNodeOfKind<TMessage, 'rangeSlider'>;
type PickerNode<TMessage> = RenderNodesOfKind<TMessage, 'colorSwatchPicker' | 'calendar'>;
type NumberInputNode<TMessage> = RenderNodeOfKind<TMessage, 'numberInput'>;
import { formOptions } from './support/choices.ts';
import {
  colorOptions,
  calendarDays,
  pickerCellWidth,
  pickerColumns,
  pickerMessageFactory,
  pickerOptionRowOffset
} from './support/pickers.ts';
import {
  rangeSliderActionMessageFactory,
  rangeSliderModel,
  rangeSliderPointerAction,
  sliderMessageFactory,
  sliderModel,
  sliderValues
} from './support/sliders.ts';
import { numberInputLayout } from './support/number-input.ts';
import {
  clean,
  labelPrefix
} from './support/shared.ts';
import { renderNodeTargetId } from '../pointer-presentation.ts';

export function controlHitTargets<TMessage>(widget: ActivationControlNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props.disabled === true) return [];
  const handler = widget.kind === 'button'
    ? widget.props.message === undefined ? undefined : () => widget.props.message
    : widget.props.toMessage === undefined ? undefined : () => widget.props.toMessage?.(!widget.props.checked);
  if (handler === undefined) return [];
  return [{
    id: controlTargetId(widget),
    bounds,
    message: handler,
    cursor: 'pointer'
  }];
}

export function controlTargetId(widget: ActivationControlNode<unknown>): string {
  return renderNodeTargetId(widget, 'control');
}

export function optionHitTargets<TMessage>(widget: OptionControlNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = widget.props.toActionMessage;
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
      message: () => toMessage({ kind: 'select', id: option.id }),
      cursor: 'pointer'
    }];
  });
}

export function checkboxGroupHitTargets<TMessage>(widget: CheckboxGroupNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = widget.props.toActionMessage;
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
      message: () => toMessage({ kind: 'toggle', id: option.id }),
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
  const toMessage = rangeSliderActionMessageFactory(widget);
  if (toMessage === undefined || widget.props.disabled === true) return [];
  const model = rangeSliderModel(widget);
  const labelWidth = terminalTextWidth(labelPrefix(clean(stringify(widget.props.label))));
  const trackBounds = {
    row: bounds.row,
    column: bounds.column + labelWidth,
    width: Math.min(model.width, Math.max(0, bounds.width - labelWidth)),
    height: Math.min(1, bounds.height)
  };
  if (trackBounds.width <= 0 || trackBounds.height <= 0) return [];
  return [{
    id: `${widget.id ?? widget.kind}:track`,
    bounds: trackBounds,
    accepts: ['pointerDown', 'dragStart', 'drag'],
    message: (event) => {
      const action = rangeSliderPointerAction(event, model, trackBounds);
      return action === undefined ? undefined : toMessage(action);
    },
    cursor: 'pointer'
  }];
}

export function numberInputHitTargets<TMessage>(
  widget: NumberInputNode<TMessage>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  const onAction = widget.props.toActionMessage;
  const layout = numberInputLayout(bounds);
  if (onAction === undefined || widget.props.disabled === true || layout === undefined) return [];
  return [
    {
      id: `${widget.id ?? widget.kind}:step:decrement`,
      bounds: layout.decrement,
      message: () => onAction({ kind: 'step', direction: 'decrement' }),
      cursor: 'pointer'
    },
    {
      id: `${widget.id ?? widget.kind}:step:increment`,
      bounds: layout.increment,
      message: () => onAction({ kind: 'step', direction: 'increment' }),
      cursor: 'pointer'
    }
  ];
}

export function pickerHitTargets<TMessage>(widget: PickerNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = pickerMessageFactory(widget);
  if (toMessage === undefined) return [];
  const columns = pickerColumns(widget, widget.kind === 'calendar' ? 7 : 4);
  const options = widget.kind === 'calendar' ? calendarDays(widget) : colorOptions(widget);
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

export function calendarNavigationHitTargets<TMessage>(
  widget: RenderNodeOfKind<TMessage, 'calendar'>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  const onAction = widget.props.toActionMessage;
  if (onAction === undefined || widget.props.disabled === true || bounds.height <= 0) return [];
  const labelOffset = clean(stringify(widget.props.label)).length > 0 ? 1 : 0;
  const monthLabelWidth = terminalTextWidth(clean(stringify(widget.props.monthLabel)));
  const row = bounds.row + labelOffset;
  return [
    {
      id: `${widget.id ?? widget.kind}:month:previous`,
      bounds: { row, column: bounds.column, width: Math.min(3, bounds.width), height: 1 },
      message: () => onAction({ kind: 'moveMonth', months: -1 }),
      cursor: 'pointer'
    },
    {
      id: `${widget.id ?? widget.kind}:month:next`,
      bounds: {
        row,
        column: bounds.column + Math.min(Math.max(0, bounds.width - 3), 4 + monthLabelWidth),
        width: Math.min(3, bounds.width),
        height: 1
      },
      message: () => onAction({ kind: 'moveMonth', months: 1 }),
      cursor: 'pointer'
    }
  ];
}
