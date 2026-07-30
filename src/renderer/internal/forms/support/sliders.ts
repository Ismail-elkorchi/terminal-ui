import type { RoutedPointerEvent } from '../../../../input/pointer.ts';
import type { RangeSliderAction, RangeSliderHandle } from '../../../../ui-model/range-slider.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { Rect } from '../../../contracts.ts';
import type { RenderSpan, TerminalStyle } from '../../frame.ts';
import { formSpan } from '../../form-visual.ts';
import { renderNodeStyle, resolveRenderNodeStyle } from '../../render-node-style.ts';
import { clampNumber, finiteNumber } from './shared.ts';
import { oneCellGlyph } from '../../../../text/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';

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
  renderNode: SliderNode<TMessage>
): ((value: number) => TMessage) | undefined {
  return renderNode.props.toMessage;
}

export function rangeSliderActionMessageFactory<TMessage>(
  renderNode: RangeSliderNode<TMessage>
): ((action: RangeSliderAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

export function sliderModel(renderNode: SliderNode): SliderModel {
  return numericSliderModel(renderNode.props);
}

export function rangeSliderModel(renderNode: RangeSliderNode): RangeSliderModel {
  const base = numericSliderModel({
    ...renderNode.props,
    ...(renderNode.props.range === undefined ? {} : {
      min: renderNode.props.range.min,
      max: renderNode.props.range.max
    }),
    value: renderNode.props.state.value.start
  });
  const start = clampNumber(finiteNumber(renderNode.props.state.value.start, base.min), base.min, base.max);
  const end = clampNumber(finiteNumber(renderNode.props.state.value.end, base.max), base.min, base.max);
  return {
    ...base,
    start: Math.min(start, end),
    end: Math.max(start, end),
    activeHandle: renderNode.props.state.activeHandle
  };
}

export function sliderTrackSpans(
  renderNode: SliderNode,
  model: SliderModel,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const position = sliderPosition(model, model.value);
  const disabled = renderNode.props.disabled === true;
  return Array.from({ length: model.width }, (_, index): RenderSpan => {
    const current = index === position
      ? { text: oneCellGlyph('●', 'o', { widthProfile }), label: 'track.handle', selected: true }
      : index < position
        ? { text: oneCellGlyph('━', '-', { widthProfile }), label: 'track.filled', selected: false }
        : { text: oneCellGlyph('─', '-', { widthProfile }), label: 'track.empty', selected: false };
    return formSpan(
      renderNode,
      current.selected ? 'handle' : 'track',
      current.label,
      current.text,
      sliderPartStyle(renderNode, current.label, disabled)
    );
  });
}

export function rangeSliderTrackSpans(
  renderNode: RangeSliderNode,
  model: RangeSliderModel,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const start = sliderPosition(model, model.start);
  const end = sliderPosition(model, model.end);
  const disabled = renderNode.props.disabled === true;
  return Array.from({ length: model.width }, (_, index): RenderSpan => {
    const current = index === start || index === end
      ? {
          text: oneCellGlyph('●', 'o', { widthProfile }),
          label: index === start ? 'track.startHandle' : 'track.endHandle',
          selected: true,
          active: index === sliderPosition(model, model.activeHandle === 'start' ? model.start : model.end)
        }
      : index > start && index < end
        ? { text: oneCellGlyph('━', '-', { widthProfile }), label: 'track.filled', selected: false, active: false }
        : { text: oneCellGlyph('─', '-', { widthProfile }), label: 'track.empty', selected: false, active: false };
    return formSpan(
      renderNode,
      current.selected ? 'handle' : 'track',
      current.label,
      current.text,
      sliderPartStyle(renderNode, current.label, disabled, current.active),
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
  renderNode: ToggleSwitchNode,
  checked: boolean
): TerminalStyle | undefined {
  if (renderNode.props.disabled === true) return renderNodeStyle(renderNode, checked ? 'onLabel' : 'offLabel', 'disabled');
  return resolveRenderNodeStyle(renderNode, {
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
  renderNode: SliderNode | RangeSliderNode,
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
  return resolveRenderNodeStyle(renderNode, {
    part: 'value',
    base,
    ...(disabled ? { state: 'disabled' } : active ? { state: 'focused' } : {})
  });
}

function quantize(value: number, model: SliderModel): number {
  const steps = Math.round((value - model.min) / model.step);
  return clampNumber(model.min + steps * model.step, model.min, model.max);
}
