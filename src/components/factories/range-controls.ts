import { defineComponent, ignoreMessage } from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  HitTarget,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import { isNonArrayObject, isStringMember } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import { measureTextCells, oneCellGlyph } from '../../text/index.ts';
import type { SliderTransition } from '../form-controls.ts';
import type { RangeSliderTransition, RangeSliderHandle } from '../../behavior/range-slider.ts';
import type { SliderStylePart } from '../style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { RangeSliderOptions, SliderOptions } from '../options/forms.ts';
import { assertTransitionCallback } from './form-control-helpers.ts';
import {
  cleanString,
  controlSpan,
  errorLines,
  measureLines,
  optionalFinite,
  optionalString,
  paintLines,
  positiveInteger,
  styled,
} from './input-control-helpers.ts';

interface SliderModel {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly width: number;
  readonly error: string;
}

type SliderComponentOptions = Omit<
  SliderOptions<ComponentMessage>,
  'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'
>;
type RangeSliderComponentOptions = Omit<
  RangeSliderOptions<ComponentMessage>,
  'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'
>;
type SliderFactory = <const TMessage extends ComponentMessage = never>(
  options: SliderOptions<TMessage>,
) => Element<TMessage>;

const instantiateSlider = defineComponent<
  SliderComponentOptions,
  SliderModel,
  SliderTransition,
  SliderStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'disabled']
>({
  name: 'terminal-ui/components/slider',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'slider',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'track', 'handle', 'value', 'error'],
  visualStates: ['focused', 'disabled'],
  createModel(value) {
    const common = createNumericSliderModel(value, 'slider');
    return { ...common, value: numberInRange(value.value, 'value', common.min, common.max, 'slider') };
  },
  measure: (input) => measureLines(sliderLines(input, false), input),
  render: (input) => {
    paintLines(input, sliderLines(input, true));
  },
  keys: ({ model }) => ({
    arrowLeft: () => ({ kind: 'change', value: quantize(model.value - model.step, model) }),
    arrowDown: () => ({ kind: 'change', value: quantize(model.value - model.step, model) }),
    arrowRight: () => ({ kind: 'change', value: quantize(model.value + model.step, model) }),
    arrowUp: () => ({ kind: 'change', value: quantize(model.value + model.step, model) }),
    home: () => ({ kind: 'change', value: model.min }),
    end: () => ({ kind: 'change', value: model.max }),
  }),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: sliderHitTargets,
  accessibility: ({ id, model, focused }) => ({
    id,
    role: 'slider',
    ...(model.label === '' ? {} : { label: model.label }),
    numericValue: { current: model.value, minimum: model.min, maximum: model.max },
    invalid: model.error !== '',
    ...(model.error === '' ? {} : {
      errorMessage: `${id}:error`,
      children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
    }),
    ...(focused ? { focused: true } : {}),
  }),
});

export const slider: SliderFactory = (options) => {
  if (options.disabled === true) {
    return instantiateSlider(options);
  }
  assertTransitionCallback(options, 'slider');
  const { onTransition, ...rest } = options;
  return instantiateSlider({
    ...rest,
    onAction: onTransition,
  });
};

interface RangeModel extends Omit<SliderModel, 'value'> {
  readonly start: number;
  readonly end: number;
  readonly activeHandle: RangeSliderHandle;
}

type RangeSliderFactory = <const TMessage extends ComponentMessage = never>(
  options: RangeSliderOptions<TMessage>,
) => Element<TMessage>;

const instantiateRangeSlider = defineComponent<
  RangeSliderComponentOptions,
  RangeModel,
  RangeSliderTransition,
  SliderStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'active', 'disabled']
>({
  name: 'terminal-ui/components/range-slider',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'group',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'track', 'handle', 'value', 'error'],
  visualStates: ['focused', 'active', 'disabled'],
  createModel: createRangeSliderModel,
  measure: (input) => measureLines(rangeLines(input, false), input),
  render: (input) => {
    paintLines(input, rangeLines(input, true));
  },
  keys: () => ({
    arrowUp: () => ({ kind: 'selectHandle', handle: 'start' }),
    arrowDown: () => ({ kind: 'selectHandle', handle: 'end' }),
    arrowLeft: () => ({ kind: 'step', direction: 'decrement' }),
    arrowRight: () => ({ kind: 'step', direction: 'increment' }),
  }),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    const track = sliderTrackBounds(input, input.model.width);
    if (track.width === 0 || track.height === 0) return [];
    return [{
      id: `${input.id ?? 'range-slider'}:track`,
      bounds: track,
      accepts: ['pointerDown', 'dragStart', 'drag'],
      cursor: 'pointer',
      focus: { kind: 'target', targetId: 'self' },
      message: (event) => rangePointerTransition(event, input.model, track) ?? ignoreMessage(),
    }];
  },
  accessibility: ({ id, model, focused, disabled }) => ({
    id,
    role: 'group',
    ...(model.label === '' ? {} : { label: model.label }),
    ...(focused ? { focused: true } : {}),
    ...(focused ? { activeDescendant: `${id}:${model.activeHandle}` } : {}),
    children: [
      {
        id: `${id}:start`,
        role: 'slider',
        label: 'Start',
        numericValue: { current: model.start, minimum: model.min, maximum: model.max },
        invalid: model.error !== '',
        ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
        ...(disabled ? { disabled: true } : {}),
        ...(model.activeHandle === 'start' ? { current: true } : {}),
      },
      {
        id: `${id}:end`,
        role: 'slider',
        label: 'End',
        numericValue: { current: model.end, minimum: model.min, maximum: model.max },
        invalid: model.error !== '',
        ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
        ...(disabled ? { disabled: true } : {}),
        ...(model.activeHandle === 'end' ? { current: true } : {}),
      },
      ...(model.error === '' ? [] : [{ id: `${id}:error`, role: 'text' as const, value: model.error }]),
    ],
  }),
});

export const rangeSlider: RangeSliderFactory = (options) => {
  if (options.disabled === true) {
    return instantiateRangeSlider(options);
  }
  assertTransitionCallback(options, 'rangeSlider');
  const { onTransition, ...rest } = options;
  return instantiateRangeSlider({
    ...rest,
    onAction: onTransition,
  });
};

function createNumericSliderModel(
  value: Readonly<Pick<
    SliderComponentOptions,
    'label' | 'min' | 'max' | 'step' | 'width' | 'error'
  >>,
  owner: string,
): Omit<SliderModel, 'value'> {
  const min = optionalFinite(value.min, `${owner} min`) ?? 0;
  const max = optionalFinite(value.max, `${owner} max`) ?? 100;
  if (max < min) throw new RangeError(`${owner} must define finite ordered bounds.`);
  const step = optionalFinite(value.step, `${owner} step`) ?? 1;
  if (step <= 0) throw new RangeError(`${owner} step must be finite and greater than zero.`);
  const width = value.width === undefined
    ? 16
    : positiveInteger(value.width, `${owner} width`);
  return {
    label: cleanString(value.label, `${owner} label`),
    min,
    max,
    step,
    width: Math.max(3, width),
    error: optionalString(value.error, `${owner} error`) ?? '',
  };
}

function numberInRange(
  value: number | undefined,
  field: string,
  min: number,
  max: number,
  owner: string,
): number {
  const label = `${owner} ${field === 'value' ? 'value' : `${field} value`}`;
  const number = optionalFinite(value, label);
  if (number === undefined || number < min || number > max) {
    throw new RangeError(`${label} must be within the declared range.`);
  }
  return number;
}

function createRangeSliderModel(
  value: Readonly<RangeSliderComponentOptions>,
): RangeModel {
  const range = value.range;
  if (range !== undefined && !isNonArrayObject(range)) {
    throw new TypeError('rangeSlider range must be an object.');
  }
  const base = createNumericSliderModel({
    label: value.label,
    ...(range?.min === undefined ? {} : { min: range.min }),
    ...(range?.max === undefined ? {} : { max: range.max }),
    ...(value.step === undefined ? {} : { step: value.step }),
    ...(value.width === undefined ? {} : { width: value.width }),
    ...(value.error === undefined ? {} : { error: value.error }),
  }, 'rangeSlider');
  const state = value.state;
  if (
    !isNonArrayObject(state) || !isNonArrayObject(state.value) ||
    !isStringMember(state.activeHandle, ['start', 'end'])
  ) throw new TypeError('rangeSlider state is invalid.');
  const start = numberInRange(state.value.start, 'start', base.min, base.max, 'rangeSlider');
  const end = numberInRange(state.value.end, 'end', base.min, base.max, 'rangeSlider');
  if (start > end) {
    throw new RangeError('rangeSlider start value must be less than or equal to end value.');
  }
  return { ...base, start, end, activeHandle: state.activeHandle };
}

function sliderLines(
  input: ComponentMeasureInput<SliderModel> | ComponentRenderInput<SliderModel, SliderStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const prefix = input.model.label === ''
    ? []
    : [styled(input, `${input.model.label}: `, 'label', decorated)];
  const position = sliderPosition(input.model, input.model.value);
  const track = Array.from({ length: input.model.width }, (_, index) => {
    const handle = index === position;
    const description = handle ? 'track.handle' : index < position ? 'track.filled' : 'track.empty';
    return controlSpan(
      input,
      handle
        ? oneCellGlyph('●', 'o', { widthProfile: input.widthProfile })
        : oneCellGlyph(index < position ? '━' : '─', '-', { widthProfile: input.widthProfile }),
      handle ? 'handle' : 'track',
      description,
      decorated,
      sliderPartStyle(description, input.disabled),
      'decoration',
      input.disabled
        ? ['disabled']
        : 'focus' in input && input.focus === 'self' ? ['focused'] : [],
    );
  });
  return [
    [...prefix, ...track, styled(input, ` ${String(input.model.value)}`, 'value', decorated)],
    ...errorLines(input, input.model.error, 'error', decorated),
  ];
}

function rangeLines(
  input: ComponentMeasureInput<RangeModel> | ComponentRenderInput<RangeModel, SliderStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const start = sliderPosition(input.model, input.model.start);
  const end = sliderPosition(input.model, input.model.end);
  const track = Array.from({ length: input.model.width }, (_, index) => {
    const handle = index === start || index === end;
    const description = index === start
      ? 'track.startHandle'
      : index === end
      ? 'track.endHandle'
      : index > start && index < end
      ? 'track.filled'
      : 'track.empty';
    const active = handle && (index === (input.model.activeHandle === 'start' ? start : end));
    const states = input.disabled
      ? ['disabled' as const]
      : [
        ...(active ? ['active' as const] : []),
        ...(active && 'focus' in input && input.focus === 'self' ? ['focused' as const] : []),
      ];
    return controlSpan(
      input,
      handle
        ? oneCellGlyph('●', 'o', { widthProfile: input.widthProfile })
        : oneCellGlyph(index > start && index < end ? '━' : '─', '-', {
          widthProfile: input.widthProfile,
        }),
      handle ? 'handle' : 'track',
      description,
      decorated,
      sliderPartStyle(
        description,
        input.disabled,
        active,
      ),
      'decoration',
      states,
    );
  });
  return [[
    ...(input.model.label === ''
      ? []
      : [styled(input, `${input.model.label}: `, 'label', decorated)]),
    ...track,
    styled(input, ` ${String(input.model.start)}–${String(input.model.end)}`, 'value', decorated),
  ], ...errorLines(input, input.model.error, 'error', decorated)];
}

function sliderPosition(model: Pick<SliderModel, 'min' | 'max' | 'width'>, value: number): number {
  return model.max === model.min ? 0 : Math.max(
    0,
    Math.min(
      model.width - 1,
      Math.round((value - model.min) / (model.max - model.min) * (model.width - 1)),
    ),
  );
}

function sliderTrackBounds(input: ComponentInput<SliderModel | RangeModel>, width: number) {
  const labelWidth = input.model.label === ''
    ? 0
    : measureTextCells(`${input.model.label}: `, { widthProfile: input.widthProfile }).cells;
  return {
    row: 0,
    column: labelWidth,
    width: Math.min(Math.max(0, input.bounds.width - labelWidth), Math.max(0, width)),
    height: Math.min(1, input.bounds.height),
  };
}

function sliderHitTargets(input: ComponentInput<SliderModel>): readonly HitTarget<SliderTransition>[] {
  const track = sliderTrackBounds(input, input.model.width);
  return sliderValues(input.model).slice(0, track.width).map((value, index) => ({
    id: `${input.id ?? 'slider'}:value:${String(index)}`,
    bounds: { row: track.row, column: track.column + index, width: 1, height: track.height },
    cursor: 'pointer' as const,
    focus: { kind: 'target' as const, targetId: 'self' },
    message: (): SliderTransition => ({ kind: 'change', value }),
  }));
}

function sliderValueAt(
  column: number,
  bounds: { readonly column: number; readonly width: number },
  model: Pick<SliderModel, 'min' | 'max' | 'step'>,
): number {
  if (bounds.width <= 1) return model.min;
  return quantize(
    model.min +
      (model.max - model.min) * Math.max(0, Math.min(bounds.width - 1, column - bounds.column)) /
        (bounds.width - 1),
    model,
  );
}

function quantize(value: number, model: Pick<SliderModel, 'min' | 'max' | 'step'>): number {
  return Math.max(
    model.min,
    Math.min(model.max, model.min + Math.round((value - model.min) / model.step) * model.step),
  );
}

function rangePointerTransition(
  event: RoutedPointerEvent,
  model: RangeModel,
  bounds: { readonly column: number; readonly width: number },
): RangeSliderTransition | undefined {
  if (
    event.button !== 'left' ||
    (event.kind !== 'pointerDown' && event.kind !== 'dragStart' && event.kind !== 'drag') ||
    bounds.width <= 0
  ) return undefined;
  const pressedColumn = bounds.column +
    Math.max(0, (event.pressLocalColumn ?? event.localColumn ?? 1) - 1);
  const currentColumn = bounds.column + Math.max(0, (event.localColumn ?? 1) - 1);
  const pressedValue = sliderValueAt(pressedColumn, bounds, model);
  const value = sliderValueAt(currentColumn, bounds, model);
  const startDistance = Math.abs(pressedValue - model.start);
  const endDistance = Math.abs(pressedValue - model.end);
  const handle = startDistance === endDistance
    ? model.activeHandle
    : startDistance < endDistance
    ? 'start'
    : 'end';
  return { kind: 'set', handle, value };
}

function sliderValues(model: SliderModel | RangeModel): readonly number[] {
  if (model.width <= 1) return [model.min];
  return Array.from(
    { length: model.width },
    (_unused, index) =>
      quantize(model.min + (model.max - model.min) * index / (model.width - 1), model),
  );
}

function sliderPartStyle(description: string, disabled: boolean, active = false): TerminalStyle {
  const base: TerminalStyle = description.toLowerCase().endsWith('handle')
    ? {
      fg: { kind: 'theme', token: 'control.handle' },
      bg: { kind: 'theme', token: 'control.track.filled' },
      bold: true,
    }
    : description === 'track.filled'
    ? { fg: { kind: 'theme', token: 'control.track.filled' } }
    : { fg: { kind: 'theme', token: 'control.track' } };
  return disabled
    ? { ...base, fg: { kind: 'theme', token: 'text.disabled' }, dim: true }
    : active
    ? { ...base, inverse: true }
    : base;
}
