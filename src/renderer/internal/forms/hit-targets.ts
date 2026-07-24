import type { RenderNodeOfKind, RenderNodesOfKind } from '../../model/index.ts';
import { terminalTextWidth } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
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
import { renderNodeTargetId } from '../pointer-interaction.ts';
import { ignoreMessage } from '../../../interaction/message.ts';

export function controlHitTargets<TMessage>(renderNode: ActivationControlNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (renderNode.props.disabled === true) return [];
  const handler = renderNode.kind === 'button'
    ? renderNode.props.toPressMessage
    : checkboxMessageHandler(renderNode);
  if (handler === undefined) return [];
  return [{
    id: controlTargetId(renderNode),
    bounds,
    message: handler,
    cursor: 'pointer'
  }];
}

function checkboxMessageHandler<TMessage>(
  renderNode: RenderNodesOfKind<TMessage, 'checkbox' | 'toggleSwitch'>
): (() => TMessage) | undefined {
  const toMessage = renderNode.props.toMessage;
  return toMessage === undefined ? undefined : () => toMessage(!renderNode.props.checked);
}

export function controlTargetId(renderNode: ActivationControlNode<unknown>): string {
  return renderNodeTargetId(renderNode, 'control');
}

export function optionHitTargets<TMessage>(renderNode: OptionControlNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  const labelOffset = clean(stringify(renderNode.props.label)).length > 0 ? 1 : 0;
  return formOptions(renderNode).flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${renderNode.id ?? renderNode.kind}:${option.id}`,
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

export function checkboxGroupHitTargets<TMessage>(renderNode: CheckboxGroupNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  const labelOffset = clean(stringify(renderNode.props.label)).length > 0 ? 1 : 0;
  return formOptions(renderNode).flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${renderNode.id ?? renderNode.kind}:${option.id}`,
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

export function sliderHitTargets<TMessage>(
  renderNode: SliderNode<TMessage>,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const toMessage = sliderMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const model = sliderModel(renderNode);
  const labelWidth = terminalTextWidth(labelPrefix(clean(stringify(renderNode.props.label))), { widthProfile });
  return sliderValues(model).map((value, index) => ({
    id: `${renderNode.id ?? renderNode.kind}:value:${String(index)}`,
    bounds: {
      row: bounds.row,
      column: bounds.column + labelWidth + index,
      width: 1,
      height: 1
    },
    message: () => toMessage(value),
    cursor: 'pointer'
  }));
}

export function rangeSliderHitTargets<TMessage>(
  renderNode: RangeSliderNode<TMessage>,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const toMessage = rangeSliderActionMessageFactory(renderNode);
  if (toMessage === undefined || renderNode.props.disabled === true) return [];
  const model = rangeSliderModel(renderNode);
  const labelWidth = terminalTextWidth(labelPrefix(clean(stringify(renderNode.props.label))), { widthProfile });
  const trackBounds = {
    row: bounds.row,
    column: bounds.column + labelWidth,
    width: Math.min(model.width, Math.max(0, bounds.width - labelWidth)),
    height: Math.min(1, bounds.height)
  };
  if (trackBounds.width <= 0 || trackBounds.height <= 0) return [];
  return [{
    id: `${renderNode.id ?? renderNode.kind}:track`,
    bounds: trackBounds,
    accepts: ['pointerDown', 'dragStart', 'drag'],
    message: (event) => {
      const action = rangeSliderPointerAction(event, model, trackBounds);
      return action === undefined ? ignoreMessage() : toMessage(action);
    },
    cursor: 'pointer'
  }];
}

export function numberInputHitTargets<TMessage>(
  renderNode: NumberInputNode<TMessage>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  const onAction = renderNode.props.toActionMessage;
  const layout = numberInputLayout(bounds);
  if (onAction === undefined || renderNode.props.disabled === true || layout === undefined) return [];
  return [
    {
      id: `${renderNode.id ?? renderNode.kind}:step:decrement`,
      bounds: layout.decrement,
      message: () => onAction({ kind: 'step', direction: 'decrement' }),
      cursor: 'pointer'
    },
    {
      id: `${renderNode.id ?? renderNode.kind}:step:increment`,
      bounds: layout.increment,
      message: () => onAction({ kind: 'step', direction: 'increment' }),
      cursor: 'pointer'
    }
  ];
}

export function pickerHitTargets<TMessage>(renderNode: PickerNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = pickerMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const columns = pickerColumns(renderNode, renderNode.kind === 'calendar' ? 7 : 4);
  const options = renderNode.kind === 'calendar' ? calendarDays(renderNode) : colorOptions(renderNode);
  const rowOffset = pickerOptionRowOffset(renderNode, columns);
  return options.flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${renderNode.id ?? renderNode.kind}:${option.id}`,
      bounds: {
        row: bounds.row + rowOffset + Math.floor(index / columns),
        column: bounds.column + (index % columns) * pickerCellWidth(renderNode),
        width: pickerCellWidth(renderNode),
        height: 1
      },
      message: () => toMessage(option),
      cursor: 'pointer'
    }];
  });
}

export function calendarNavigationHitTargets<TMessage>(
  renderNode: RenderNodeOfKind<TMessage, 'calendar'>,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const onAction = renderNode.props.toActionMessage;
  if (onAction === undefined || renderNode.props.disabled === true || bounds.height <= 0) return [];
  const labelOffset = clean(stringify(renderNode.props.label)).length > 0 ? 1 : 0;
  const monthLabelWidth = terminalTextWidth(clean(stringify(renderNode.props.monthLabel)), { widthProfile });
  const row = bounds.row + labelOffset;
  return [
    {
      id: `${renderNode.id ?? renderNode.kind}:month:previous`,
      bounds: { row, column: bounds.column, width: Math.min(3, bounds.width), height: 1 },
      message: () => onAction({ kind: 'moveMonth', months: -1 }),
      cursor: 'pointer'
    },
    {
      id: `${renderNode.id ?? renderNode.kind}:month:next`,
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
