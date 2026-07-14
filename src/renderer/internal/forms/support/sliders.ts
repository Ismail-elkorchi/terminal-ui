import type { RoutedPointerEvent } from '../../../../input/pointer.ts';
import type { RangeSliderAction, RangeSliderHandle } from '../../../../ui-model/range-slider.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { Rect } from '../../../model/layout.ts';
import type { RenderSpan, TerminalStyle } from '../../frame.ts';
import { formSpan } from '../../form-visual.ts';
import { renderNodeStyle, resolveRenderNodeStyle } from '../../render-node-style.ts';
import { clampNumber, finiteNumber } from './shared.ts';

type ToggleSwitchNode = RenderNodeOfKind<unknown, 'toggleSwitch'>;
type SliderNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'slider'>;
type RangeSliderNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'rangeSlider'>;

export interface SliderModel {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly width: number;
}

export interface RangeSliderModel extends SliderModel {
  readonly start: number;
  readonly end: number;
  readonly activeHandle: RangeSliderHandle;
}

export function sliderMessageFactory<TMessage>(
  widget: SliderNode<TMessage>
): ((value: number) => TMessage) | undefined {
  return widget.props.toMessage;
}

export function rangeSliderActionMessageFactory<TMessage>(
  widget: RangeSliderNode<TMessage>
): ((action: RangeSliderAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

export function sliderModel(widget: SliderNode): SliderModel {
  return numericSliderModel(widget.props);
}

export function rangeSliderModel(widget: RangeSliderNode): RangeSliderModel {
  const base = numericSliderModel({
    ...widget.props,
    ...(widget.props.range === undefined ? {} : {
      min: widget.props.range.min,
      max: widget.props.range.max
    }),
    value: widget.props.presentation.value.start
  });
  const start = clampNumber(finiteNumber(widget.props.presentation.value.start, base.min), base.min, base.max);
  const end = clampNumber(finiteNumber(widget.props.presentation.value.end, base.max), base.min, base.max);
  return {
    ...base,
    start: Math.min(start, end),
    end: Math.max(start, end),
    activeHandle: widget.props.presentation.activeHandle
  };
}

export function sliderTrackSpans(widget: SliderNode, model: SliderModel): readonly RenderSpan[] {
  const position = sliderPosition(model, model.value);
  const disabled = widget.props.disabled === true;
  return Array.from({ length: model.width }, (_, index): RenderSpan => {
    const current = index === position
      ? { text: '●', label: 'track.handle', selected: true }
      : index < position
        ? { text: '━', label: 'track.filled', selected: false }
        : { text: '─', label: 'track.empty', selected: false };
    return formSpan(
      widget,
      current.selected ? 'handle' : 'track',
      current.label,
      current.text,
      sliderPartStyle(widget, current.label, disabled)
    );
  });
}

export function rangeSliderTrackSpans(
  widget: RangeSliderNode,
  model: RangeSliderModel
): readonly RenderSpan[] {
  const start = sliderPosition(model, model.start);
  const end = sliderPosition(model, model.end);
  const disabled = widget.props.disabled === true;
  return Array.from({ length: model.width }, (_, index): RenderSpan => {
    const current = index === start || index === end
      ? {
          text: '●',
          label: index === start ? 'track.startHandle' : 'track.endHandle',
          selected: true,
          active: index === sliderPosition(model, model.activeHandle === 'start' ? model.start : model.end)
        }
      : index > start && index < end
        ? { text: '━', label: 'track.filled', selected: false, active: false }
        : { text: '─', label: 'track.empty', selected: false, active: false };
    return formSpan(
      widget,
      current.selected ? 'handle' : 'track',
      current.label,
      current.text,
      sliderPartStyle(widget, current.label, disabled, current.active),
      current.active ? 'active' : undefined
    );
  });
}

export function rangeSliderPointerAction(
  event: RoutedPointerEvent,
  model: RangeSliderModel,
  trackBounds: Rect
): RangeSliderAction | undefined {
  if (event.button !== 'left' || !isRangePointerEvent(event.kind) || trackBounds.width <= 0) return undefined;
  const pressedValue = rangeSliderValueAtColumn(model, trackBounds, event.pressColumn ?? event.column);
  return {
    kind: 'set',
    handle: nearestHandle(model, pressedValue),
    value: rangeSliderValueAtColumn(model, trackBounds, event.column)
  };
}

function rangeSliderValueAtColumn(model: RangeSliderModel, trackBounds: Rect, column: number): number {
  const values = sliderValues(model);
  const index = Math.max(0, Math.min(trackBounds.width - 1, column - trackBounds.column));
  return values[index] ?? model.min;
}

function nearestHandle(model: RangeSliderModel, value: number): RangeSliderHandle {
  const startDistance = Math.abs(value - model.start);
  const endDistance = Math.abs(value - model.end);
  if (startDistance === endDistance) return model.activeHandle;
  return startDistance < endDistance ? 'start' : 'end';
}

function isRangePointerEvent(kind: RoutedPointerEvent['kind']): boolean {
  return kind === 'pointerDown' || kind === 'dragStart' || kind === 'drag';
}

export function toggleValueStyle(
  widget: ToggleSwitchNode,
  checked: boolean
): TerminalStyle | undefined {
  if (widget.props.disabled === true) return renderNodeStyle(widget, checked ? 'onLabel' : 'offLabel', 'disabled');
  return resolveRenderNodeStyle(widget, {
    part: checked ? 'onLabel' : 'offLabel',
    base: {
      fg: { kind: 'theme', token: checked ? 'control.primary.foreground' : 'control.foreground' },
      bg: { kind: 'theme', token: checked ? 'control.toggle.on.background' : 'control.toggle.off.background' },
      ...(checked ? { bold: true } : {})
    }
  });
}

export function sliderPosition(model: SliderModel, value: number): number {
  if (model.max === model.min) return 0;
  return Math.max(
    0,
    Math.min(model.width - 1, Math.round(((value - model.min) / (model.max - model.min)) * (model.width - 1)))
  );
}

export function sliderValues(model: SliderModel): readonly number[] {
  if (model.width <= 1) return [model.min];
  return Array.from({ length: model.width }, (_, index) => {
    const raw = model.min + ((model.max - model.min) * index) / (model.width - 1);
    return quantize(raw, model);
  });
}

function numericSliderModel(props: {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly value: number;
  readonly width?: number;
}): SliderModel {
  const min = finiteNumber(props.min, 0);
  const max = Math.max(min, finiteNumber(props.max, 100));
  const step = Math.max(0.000001, finiteNumber(props.step, 1));
  return {
    min,
    max,
    step,
    value: clampNumber(finiteNumber(props.value, min), min, max),
    width: Math.max(3, Math.floor(finiteNumber(props.width, 16)))
  };
}

function sliderPartStyle(
  widget: SliderNode | RangeSliderNode,
  label: string,
  disabled: boolean,
  active = false
): TerminalStyle | undefined {
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
    part: 'value',
    base,
    ...(disabled ? { state: 'disabled' } : active ? { state: 'focused' } : {})
  });
}

function quantize(value: number, model: SliderModel): number {
  const steps = Math.round((value - model.min) / model.step);
  return clampNumber(model.min + steps * model.step, model.min, model.max);
}
