import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  prepareTerminalStyle,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentPointerActions,
  ComponentRenderInput,
  HitTarget,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';
import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings } from '../../element/metadata.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { FocusTarget, Measurement } from '../../renderer/index.ts';
import {
  assertOptionalCallback,
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import {
  pointerVisualState,
  preparePointerInteractionState,
} from '../../interaction/pointer-interaction.ts';
import {
  ownSelectionState,
  type CollectionInteractionState,
  type SelectionState,
} from '../../interaction/collection.ts';
import {
  clipTextCells,
  measureTextCells,
  normalizeTextSelection,
  oneCellGlyph,
  padTextCells,
  sanitizeTerminalText,
  segmentGraphemes,
  terminalTextWidth,
} from '../../text/index.ts';
import type { TextEditOperation } from '../../text/index.ts';
import type { TextSelection } from '../../text/index.ts';
import type { CalendarAction, CalendarDay } from '../../ui-model/calendar.ts';
import type { ChoiceItem } from '../../ui-model/contracts.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
} from '../../ui-model/choice-controls.ts';
import type { SliderAction } from '../../ui-model/forms.ts';
import type {
  NumberInputControlAction,
  NumberInputPresentation,
} from '../../ui-model/number-input.ts';
import type { RangeSliderAction, RangeSliderHandle } from '../../ui-model/range-slider.ts';
import type {
  ChoiceStylePart,
  NumberInputStylePart,
  PickerStylePart,
  SliderStylePart,
  TextEntryStylePart,
} from '../../ui-model/style-parts.ts';
import type { TextInputAction, TextInputPresentation } from '../../ui-model/text-input.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type {
  CalendarOptions,
  CheckboxGroupOptions,
  ColorSwatchPickerOptions,
  NumberInputOptions,
  PasswordInputOptions,
  RadioGroupOptions,
  RangeSliderOptions,
  SliderOptions,
  TextInputOptions,
} from '../options/forms.ts';

interface PointerModel {
  readonly pointerState?: PointerInteractionState;
}

interface PointerLifecycleAction {
  readonly kind: 'pointerLifecycle';
  readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction;
}

interface SliderModel extends PointerModel {
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
  'id' | 'disabled' | 'onAction' | 'onPointerAction' | 'meta'
>;
type RangeSliderComponentOptions = Omit<
  RangeSliderOptions<ComponentMessage>,
  'id' | 'disabled' | 'onAction' | 'onPointerAction' | 'meta'
>;
type CheckboxGroupComponentOptions = Omit<
  CheckboxGroupOptions<unknown, ComponentMessage>,
  'id' | 'disabled' | 'onAction' | 'onPointerAction' | 'meta'
>;
type RadioGroupComponentOptions = Omit<
  RadioGroupOptions<unknown, ComponentMessage>,
  'id' | 'disabled' | 'onAction' | 'onPointerAction' | 'meta'
>;

type SliderFactory = <const TMessage extends ComponentMessage = never>(
  options: SliderOptions<TMessage>,
) => Element<TMessage>;

const instantiateSlider = defineComponent<
  SliderComponentOptions,
  SliderModel,
  SliderAction | PointerLifecycleAction,
  SliderStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/slider',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'slider',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'track', 'handle', 'value', 'error'],
  prepare(value, context) {
    const common = prepareNumericSlider(value, 'slider', !context.disabled && !context.inert);
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
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: sliderHitTargets,
  accessibility: ({ id, model, focused }) => ({
    id,
    role: 'slider',
    label: model.label || id,
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
  assertControlCallbacks(options, 'slider');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateSlider({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
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
  RangeSliderAction | PointerLifecycleAction,
  SliderStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/range-slider',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'group',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'track', 'handle', 'value', 'error'],
  prepare: (value, context) => prepareRangeSlider(value, !context.disabled && !context.inert),
  measure: (input) => measureLines(rangeLines(input, false), input),
  render: (input) => {
    paintLines(input, rangeLines(input, true));
  },
  keys: ({ model }) => ({
    tab: () => ({ kind: 'selectHandle', handle: model.activeHandle === 'start' ? 'end' : 'start' }),
    arrowLeft: () => ({ kind: 'step', direction: 'decrement' }),
    arrowRight: () => ({ kind: 'step', direction: 'increment' }),
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
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
      message: (event) => rangePointerAction(event, input.model, track) ?? ignoreMessage(),
    }];
  },
  accessibility: ({ id, model, focused, disabled }) => ({
    id,
    role: 'group',
    label: model.label || id,
    ...(focused ? { focused: true } : {}),
    children: [
      {
        id: `${id}:start`,
        role: 'slider',
        label: 'Start',
        numericValue: { current: model.start, minimum: model.min, maximum: model.max },
        invalid: model.error !== '',
        ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
        ...(disabled ? { disabled: true } : {}),
      },
      {
        id: `${id}:end`,
        role: 'slider',
        label: 'End',
        numericValue: { current: model.end, minimum: model.min, maximum: model.max },
        invalid: model.error !== '',
        ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
        ...(disabled ? { disabled: true } : {}),
      },
      ...(model.error === '' ? [] : [{ id: `${id}:error`, role: 'text' as const, value: model.error }]),
    ],
  }),
});

export const rangeSlider: RangeSliderFactory = (options) => {
  if (options.disabled === true) {
    return instantiateRangeSlider(options);
  }
  assertControlCallbacks(options, 'rangeSlider');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateRangeSlider({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

interface ChoiceModel extends PointerModel {
  readonly label: string;
  readonly options: readonly PreparedChoice[];
  readonly interaction: CollectionInteractionState;
  readonly required: boolean;
  readonly error: string;
}

interface PreparedChoice {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
}

type CheckboxGroupFactory = <TValue, const TMessage extends ComponentMessage = never>(
  options: CheckboxGroupOptions<TValue, TMessage>,
) => Element<TMessage>;

const instantiateCheckboxGroup = defineComponent<
  CheckboxGroupComponentOptions,
  ChoiceModel,
  CheckboxGroupAction | PointerLifecycleAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...choiceDefinitionBase('checkbox-group'),
  accessibleRole: 'group',
  prepare: (value, context) => prepareChoiceModel(value, 'checkboxGroup', true, !context.disabled && !context.inert),
  render: (input) => {
    paintLines(input, choiceLines(input, 'checkbox', true));
  },
  measure: (input) => measureLines(choiceLines(input, 'checkbox', false), input),
  keys: ({ model }) => checkboxChoiceKeys(model),
  hitTargets: checkboxChoiceHitTargets,
  accessibility: (input) => choiceAccessibility(input, 'checkbox'),
});

export const checkboxGroup: CheckboxGroupFactory = (options) => {
  if (options.disabled === true) {
    return instantiateCheckboxGroup(options);
  }
  assertControlCallbacks(options, 'checkboxGroup');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateCheckboxGroup({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

type RadioGroupFactory = <TValue, const TMessage extends ComponentMessage = never>(
  options: RadioGroupOptions<TValue, TMessage>,
) => Element<TMessage>;

const instantiateRadioGroup = defineComponent<
  RadioGroupComponentOptions,
  ChoiceModel,
  RadioGroupAction | PointerLifecycleAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...choiceDefinitionBase('radio-group'),
  accessibleRole: 'radiogroup',
  prepare: (value, context) => prepareChoiceModel(value, 'radioGroup', false, !context.disabled && !context.inert),
  render: (input) => {
    paintLines(input, choiceLines(input, 'radio', true));
  },
  measure: (input) => measureLines(choiceLines(input, 'radio', false), input),
  keys: ({ model }) => radioChoiceKeys(model),
  hitTargets: radioChoiceHitTargets,
  accessibility: (input) => choiceAccessibility(input, 'radio'),
});

export const radioGroup: RadioGroupFactory = (options) => {
  if (options.disabled === true) {
    return instantiateRadioGroup(options);
  }
  assertControlCallbacks(options, 'radioGroup');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateRadioGroup({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

interface SwatchModel extends PointerModel {
  readonly label: string;
  readonly options: readonly PreparedSwatch[];
  readonly interaction: CollectionInteractionState;
  readonly columns: number;
  readonly error: string;
}

interface PreparedSwatch extends PreparedChoice {
  readonly swatch: string;
  readonly swatchStyle?: TerminalStyle;
}

type ColorSwatchPickerFactory = <
  TValue,
  const TMessage extends ComponentMessage = never,
>(
  options: ColorSwatchPickerOptions<TValue, TMessage>,
) => Element<TMessage>;

const instantiateColorSwatchPicker = defineComponent<
  Omit<ColorSwatchPickerOptions<unknown, ComponentMessage>, 'id' | 'disabled' | 'onAction' | 'onPointerAction' | 'meta'>,
  SwatchModel,
  ColorSwatchPickerAction | PointerLifecycleAction,
  PickerStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/color-swatch-picker',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'listbox',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'summary', 'option', 'swatch', 'error'],
  prepare: (value, context) => prepareSwatches(value, !context.disabled && !context.inert),
  measure: (input) => measureLines(swatchLines(input, false), input),
  render: (input) => {
    paintLines(input, swatchLines(input, true));
  },
  keys: ({ model }) => pickerKeys(model),
  pointer: pointerLifecyclePolicy(),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    const rowOffset = (input.model.label === '' ? 0 : 1) +
      (selectedSwatch(input.model) === undefined ? 0 : 1);
    return input.model.options.flatMap((option, index) =>
      option.disabled ? [] : [{
        id: `${input.id ?? 'swatches'}:${option.id}`,
        bounds: {
          row: rowOffset + Math.floor(index / input.model.columns),
          column: (index % input.model.columns) * 12,
          width: 12,
          height: 1,
        },
        cursor: 'pointer' as const,
        focus: { kind: 'target' as const, targetId: 'self' },
        message: () => ({ kind: 'select' as const, id: option.id }),
      }]
    );
  },
  accessibility({ id, model, focused, disabled }) {
    const selected = selectedSwatch(model);
    return {
      id,
      role: 'listbox',
      label: model.label || id,
      ...(selected === undefined ? {} : { value: selected.label }),
      invalid: model.error !== '',
      ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
      ...(focused ? { focused: true } : {}),
      children: [...model.options.map((option) => ({
        id: `${id}:${option.id}`,
        role: 'option' as const,
        label: option.label,
        selected: isChoiceSelected(model.interaction.selection, option.id),
        ...(disabled || option.disabled ? { disabled: true } : {}),
      })), ...(model.error === '' ? [] : [{ id: `${id}:error`, role: 'group' as const, label: model.error }])],
    };
  },
});

export const colorSwatchPicker: ColorSwatchPickerFactory = (options) => {
  if (options.disabled === true) {
    return instantiateColorSwatchPicker(options);
  }
  assertControlCallbacks(options, 'colorSwatchPicker');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateColorSwatchPicker({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

interface CalendarModel extends PointerModel {
  readonly label: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly PreparedDay[];
  readonly interaction: CollectionInteractionState;
  readonly error: string;
}

interface PreparedDay extends CalendarDay {
  readonly disabled: boolean;
  readonly hidden: boolean;
}

type CalendarFactory = <const TMessage extends ComponentMessage = never>(
  options: CalendarOptions<TMessage>,
) => Element<TMessage>;

const instantiateCalendar = defineComponent<
  Omit<CalendarOptions<ComponentMessage>, 'id' | 'disabled' | 'onAction' | 'onPointerAction' | 'meta'>,
  CalendarModel,
  CalendarAction | PointerLifecycleAction,
  PickerStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/calendar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'grid',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'option', 'month', 'weekday', 'error'],
  prepare: (value, context) => prepareCalendar(value, !context.disabled && !context.inert),
  measure: (input) => measureLines(calendarLines(input, false), input),
  render: (input) => {
    paintLines(input, calendarLines(input, true));
  },
  keys: ({ model }) => ({
    arrowLeft: () => ({ kind: 'moveActive', days: -1 }),
    arrowRight: () => ({ kind: 'moveActive', days: 1 }),
    arrowUp: () => ({ kind: 'moveActive', days: -7 }),
    arrowDown: () => ({ kind: 'moveActive', days: 7 }),
    pageUp: () => ({ kind: 'moveMonth', months: -1 }),
    pageDown: () => ({ kind: 'moveMonth', months: 1 }),
    home: () => ({ kind: 'startOfWeek' }),
    end: () => ({ kind: 'endOfWeek' }),
    ...(activeDay(model) === undefined ? {} : {
      enter: () => ({ kind: 'commitActive' as const }),
    }),
  }),
  pointer: pointerLifecyclePolicy(),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: calendarHitTargets,
  accessibility({ id, model, focused, disabled }) {
    const days = model.days.filter((day) => !day.hidden);
    const rowCount = Math.ceil(days.length / 7);
    return {
      id,
      role: 'grid',
      label: model.label || model.monthLabel || id,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
      ...(focused ? { focused: true } : {}),
      ...(rowCount === 0 ? {} : { position: { rowCount, columnCount: 7 } }),
      children: [...Array.from({ length: rowCount }, (_, rowIndex) => ({
        id: `${id}:week:${String(rowIndex + 1)}`,
        role: 'row' as const,
        position: { rowIndex: rowIndex + 1, rowCount, columnCount: 7 },
        children: days.slice(rowIndex * 7, (rowIndex + 1) * 7).map((day, columnIndex) => ({
          id: `${id}:${day.id}`,
          role: 'gridcell' as const,
          label: day.id,
          selected: isChoiceSelected(model.interaction.selection, day.id),
          position: { rowIndex: rowIndex + 1, columnIndex: columnIndex + 1, columnCount: 7 },
          ...(disabled || day.disabled ? { disabled: true } : {}),
        })),
      })), ...(model.error === '' ? [] : [{
        id: `${id}:error-row`,
        role: 'row' as const,
        children: [{ id: `${id}:error`, role: 'gridcell' as const, label: model.error }],
      }])],
    };
  },
});

export const calendar: CalendarFactory = (options) => {
  if (options.disabled === true) {
    return instantiateCalendar(options);
  }
  assertControlCallbacks(options, 'calendar');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateCalendar({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

interface TextEntryModel extends PointerModel {
  readonly presentation: TextInputPresentation;
  readonly displayedValue: string;
  readonly placeholder: string;
  readonly required: boolean;
  readonly error: string;
  readonly sourceValue: string;
  readonly displayedSelection?: TextSelection;
  readonly maskCodeUnits?: number;
}

const textInputDefinition = textEntryDefinition<
  TextInputComponentOptions
>('text-input', false);
const passwordInputDefinition = textEntryDefinition<
  PasswordInputComponentOptions
>('password-input', true);

export function textInput<const TMessage extends ComponentMessage = never>(
  options: TextInputOptions<TMessage>,
): Element<TMessage> {
  if (options.disabled === true) {
    return textInputDefinition(options);
  }
  assertControlCallbacks(options, 'textInput');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return textInputDefinition({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
}

export function passwordInput<const TMessage extends ComponentMessage = never>(
  options: PasswordInputOptions<TMessage>,
): Element<TMessage> {
  if (options.disabled === true) {
    return passwordInputDefinition(options);
  }
  assertControlCallbacks(options, 'passwordInput');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return passwordInputDefinition({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
}

interface NumberModel extends PointerModel {
  readonly presentation: NumberInputPresentation;
  readonly placeholder: string;
  readonly required: boolean;
  readonly error: string;
}

type NumberInputFactory = <const TMessage extends ComponentMessage = never>(
  options: NumberInputOptions<TMessage>,
) => Element<TMessage>;

const instantiateNumberInput = defineComponent<
  Omit<NumberInputOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onAction' | 'onPointerAction' | 'meta'>,
  NumberModel,
  NumberInputControlAction | PointerLifecycleAction,
  NumberInputStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/number-input',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'spinbutton',
  states: ['disabled', 'readOnly'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['border', 'value', 'placeholder', 'selection', 'cursor', 'stepper', 'error'],
  prepare: (value, context) => prepareNumberInput(value, !context.disabled && !context.inert),
  measure: measureNumberInput,
  render: paintNumberInput,
  keys: ({ readOnly }) => ({
    triggers: textEditingTriggers(readOnly, false),
    ...(readOnly ? {} : {
      backspace: () => edit('deleteBackward'),
      delete: () => edit('deleteForward'),
      arrowUp: () => ({ kind: 'step' as const, direction: 'increment' as const }),
      arrowDown: () => ({ kind: 'step' as const, direction: 'decrement' as const }),
      enter: () => ({ kind: 'commit' as const }),
    }),
    arrowLeft: () => edit('moveLeft'),
    arrowRight: () => edit('moveRight'),
    home: () => edit('moveHome'),
    end: () => edit('moveEnd'),
  }),
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  pointer: pointerLifecyclePolicy(),
  focusTargets: (input) => {
    const bounds = numberInputGeometry(input.bounds, input.disabled || input.readOnly)?.input ?? input.bounds;
    const cursorStyle = input.style({
      part: 'cursor',
      state: 'focused',
      base: { fg: { kind: 'theme', token: 'input.cursor' }, bold: true, inverse: true },
    });
    return [{
      id: 'self',
      bounds,
      cursor: {
        row: 0,
        column: Math.max(
          0,
          Math.min(
            Math.max(0, bounds.width - 1),
            2 +
              textPrefixCells(
                input.model.presentation.value,
                input.model.presentation.cursor,
                input.widthProfile,
              ),
          ),
        ),
        ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
        source: input.source({
          cellRole: 'cursor',
          partName: 'value',
          partType: 'cursor',
          description: 'cursor',
        }),
      },
    }];
  },
  hitTargets: numberInputHitTargets,
  accessibility: ({ id, model, focused }) => {
    const description = [
      model.required ? 'Required.' : '',
      model.error,
      `Numeric input is ${model.presentation.validity}.`,
      model.presentation.committedValue === undefined
        ? ''
        : `Committed value: ${String(model.presentation.committedValue)}.`,
    ].filter(Boolean).join(' ');
    return {
      id,
      role: 'spinbutton',
      label: id,
      value: model.presentation.value,
      required: model.required,
      invalid: model.error !== '' || model.presentation.validity === 'invalid' || model.presentation.validity === 'outOfRange',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(model.presentation.validity === 'valid' || model.presentation.validity === 'outOfRange'
        ? {
          numericValue: {
            current: model.presentation.parsedValue,
            ...(model.presentation.min === undefined ? {} : { minimum: model.presentation.min }),
            ...(model.presentation.max === undefined ? {} : { maximum: model.presentation.max }),
          },
        }
        : {}),
      description,
      ...(focused ? { focused: true } : {}),
    };
  },
});

export const numberInput: NumberInputFactory = (options) => {
  if (options.disabled === true) {
    return instantiateNumberInput(options);
  }
  assertControlCallbacks(options, 'numberInput');
  const { onAction, onPointerAction: onPointer, ...rest } = options;
  return instantiateNumberInput({
    ...rest,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointer?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

function assertControlCallbacks(
  options: { readonly onAction?: unknown; readonly onPointerAction?: unknown },
  component: string,
): void {
  assertRequiredCallback(options.onAction, `${component} onAction`);
  assertOptionalCallback(options.onPointerAction, `${component} onPointerAction`);
}

interface ChoiceDefinitionBase<TName extends 'checkbox-group' | 'radio-group'> {
  readonly name: `terminal-ui/components/${TName}`;
  readonly identity: 'required';
  readonly structure: 'leaf';
  readonly semantics: 'semantic';
  readonly states: readonly ['disabled'];
  readonly metadata: readonly ['focus', 'layer', 'styles'];
  readonly parts: readonly ['label', 'marker', 'option', 'description', 'error'];
  readonly pointer: ComponentPointerActions<PointerModel, PointerLifecycleAction>;
  readonly focusTargets: (input: ComponentInput<ChoiceModel>) => readonly FocusTarget[];
}

function choiceDefinitionBase<const TName extends 'checkbox-group' | 'radio-group'>(
  name: TName,
): ChoiceDefinitionBase<TName> {
  return {
    name: `terminal-ui/components/${name}` as const,
    identity: 'required' as const,
    structure: 'leaf' as const,
    semantics: 'semantic' as const,
    states: ['disabled'] as const,
    metadata: ['focus', 'layer', 'styles'] as const,
    parts: ['label', 'marker', 'option', 'description', 'error'] as const,
    pointer: pointerLifecyclePolicy(),
    focusTargets: ({ bounds }: ComponentInput<ChoiceModel>) => [{ id: 'self', bounds }],
  };
}

function pointerLifecyclePolicy(): ComponentPointerActions<PointerModel, PointerLifecycleAction> {
  return {
    state: ({ model }: { readonly model: PointerModel }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  };
}

function preparePointer(
  value: PointerInteractionState | undefined,
  owner: string,
  available: boolean,
): PointerInteractionState | undefined {
  return preparePointerInteractionState(value, `${owner} pointerState`, available);
}

function prepareNumericSlider(
  value: Readonly<Pick<
    SliderComponentOptions,
    'label' | 'min' | 'max' | 'step' | 'width' | 'error' | 'pointerState'
  >>,
  owner: string,
  pointerAvailable: boolean,
): Omit<SliderModel, 'value'> {
  const min = optionalFinite(value.min, `${owner} min`) ?? 0;
  const max = optionalFinite(value.max, `${owner} max`) ?? 100;
  if (max < min) throw new RangeError(`${owner} must define finite ordered bounds.`);
  const step = optionalFinite(value.step, `${owner} step`) ?? 1;
  if (step <= 0) throw new RangeError(`${owner} step must be finite and greater than zero.`);
  const width = value.width === undefined
    ? 16
    : positiveInteger(value.width, `${owner} width`);
  const pointerState = preparePointer(value.pointerState, owner, pointerAvailable);
  return {
    label: cleanString(value.label, `${owner} label`),
    min,
    max,
    step,
    width: Math.max(3, width),
    error: optionalString(value.error, `${owner} error`) ?? '',
    ...(pointerState === undefined ? {} : { pointerState }),
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

function prepareRangeSlider(
  value: Readonly<RangeSliderComponentOptions>,
  pointerAvailable: boolean,
): RangeModel {
  const range = value.range;
  if (range !== undefined && !isNonArrayObject(range)) {
    throw new TypeError('rangeSlider range must be an object.');
  }
  const base = prepareNumericSlider({
    label: value.label,
    ...(range?.min === undefined ? {} : { min: range.min }),
    ...(range?.max === undefined ? {} : { max: range.max }),
    ...(value.step === undefined ? {} : { step: value.step }),
    ...(value.width === undefined ? {} : { width: value.width }),
    ...(value.error === undefined ? {} : { error: value.error }),
    ...(value.pointerState === undefined ? {} : { pointerState: value.pointerState }),
  }, 'rangeSlider', pointerAvailable);
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
        handle && (index === (input.model.activeHandle === 'start' ? start : end)),
      ),
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

function sliderHitTargets(input: ComponentInput<SliderModel>): readonly HitTarget<SliderAction>[] {
  const track = sliderTrackBounds(input, input.model.width);
  return sliderValues(input.model).slice(0, track.width).map((value, index) => ({
    id: `${input.id ?? 'slider'}:value:${String(index)}`,
    bounds: { row: track.row, column: track.column + index, width: 1, height: track.height },
    cursor: 'pointer' as const,
    focus: { kind: 'target' as const, targetId: 'self' },
    message: (): SliderAction => ({ kind: 'change', value }),
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

function rangePointerAction(
  event: RoutedPointerEvent,
  model: RangeModel,
  bounds: { readonly column: number; readonly width: number },
): RangeSliderAction | undefined {
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
  const base: TerminalStyle = description.toLocaleLowerCase().endsWith('handle')
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
    ? { ...base, bold: true }
    : base;
}

function prepareChoiceModel(
  value: Readonly<CheckboxGroupComponentOptions | RadioGroupComponentOptions>,
  owner: string,
  multiple: boolean,
  pointerAvailable: boolean,
): ChoiceModel {
  const options = value.options.map((item, index) =>
    prepareChoice(item, `${owner} options[${String(index)}]`)
  );
  assertUnique(options, owner);
  const interaction = prepareChoiceInteraction(
    value.presentation,
    multiple ? 'multiple' : 'single',
    owner,
    options.map((option) => option.id),
  );
  const pointerState = preparePointer(value.pointerState, owner, pointerAvailable);
  return {
    label: cleanString(value.label, `${owner} label`),
    options,
    interaction,
    required: optionalBoolean(value.required, `${owner} required`) ?? false,
    error: optionalString(value.error, `${owner} error`) ?? '',
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareChoiceInteraction(
  value: unknown,
  expectedMode: 'single' | 'multiple',
  owner: string,
  itemIds: readonly string[],
): CollectionInteractionState {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${owner} presentation must contain collection interaction state.`);
  }
  const activeId = optionalString(value['activeId'], `${owner} activeId`);
  const preparedSelection = ownSelectionState(value['selection'], `${owner} selection`);
  if (preparedSelection.mode !== expectedMode) {
    throw new TypeError(`${owner} selection mode must be ${expectedMode}.`);
  }
  const referencedIds = [
    ...(activeId === undefined ? [] : [activeId]),
    ...choiceSelectedIds(preparedSelection),
    ...(preparedSelection.mode === 'multiple' && preparedSelection.anchorId !== undefined
      ? [preparedSelection.anchorId]
      : []),
  ];
  if (referencedIds.some((id) => !itemIds.includes(id))) {
    throw new RangeError(`${owner} interaction must reference an existing item.`);
  }
  return {
    ...(activeId === undefined ? {} : { activeId }),
    selection: preparedSelection,
  };
}

function choiceSelectedIds(selection: SelectionState): readonly string[] {
  if (selection.mode === 'none') return [];
  return selection.mode === 'single'
    ? selection.selectedId === undefined ? [] : [selection.selectedId]
    : selection.selectedIds;
}

function singleSelectedId(selection: SelectionState): string | undefined {
  return selection.mode === 'single' ? selection.selectedId : undefined;
}

function isChoiceSelected(selection: SelectionState, id: string): boolean {
  return choiceSelectedIds(selection).includes(id);
}

function prepareChoice(
  value: ChoiceItem<unknown>,
  owner: string,
): PreparedChoice {
  const description = optionalString(value.description, `${owner}.description`);
  return {
    id: cleanString(value.id, `${owner}.id`),
    label: cleanString(value.label, `${owner}.label`),
    ...(description === undefined ? {} : { description }),
    disabled: optionalBoolean(value.disabled, `${owner}.disabled`) ?? false,
  };
}

function choiceLines(
  input: ComponentMeasureInput<ChoiceModel> | ComponentRenderInput<ChoiceModel, ChoiceStylePart>,
  kind: 'checkbox' | 'radio',
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const selected = new Set(choiceSelectedIds(input.model.interaction.selection));
  const optionLines = input.model.options.flatMap((option): readonly (readonly RenderSpan[])[] => {
    const state = input.disabled || option.disabled
      ? 'disabled' as const
      : pointerVisualState(input.model.pointerState, `${input.id ?? kind}:${option.id}`);
    const marker = selected.has(option.id)
      ? kind === 'checkbox'
        ? input.theme.tokens.symbols.checkboxChecked
        : input.theme.tokens.symbols.radioChecked
      : kind === 'checkbox'
      ? input.theme.tokens.symbols.checkboxUnchecked
      : input.theme.tokens.symbols.radioUnchecked;
    return [
      choiceLine(
        input,
        option,
        [
          choiceSpan(
            input,
            marker,
            'marker',
            `option.${option.id}.marker.${selected.has(option.id) ? 'checked' : 'unchecked'}`,
            decorated,
            state,
          ),
          choiceSpan(
            input,
            ' ',
            'option',
            `option.${option.id}.gap`,
            decorated,
            state,
            'separator',
          ),
          choiceSpan(input, option.label, 'option', `option.${option.id}.label`, decorated, state),
        ],
        decorated,
        state,
      ),
      ...(option.description === undefined ? [] : [choiceLine(
        input,
        option,
        [
          choiceSpan(
            input,
            '  ',
            'description',
            `option.${option.id}.description.indent`,
            decorated,
            state,
            'decoration',
          ),
          choiceSpan(
            input,
            option.description,
            'description',
            `option.${option.id}.description`,
            decorated,
            state,
          ),
        ],
        decorated,
        state,
      )]),
    ];
  });
  return [
    [styled(
      input,
      input.model.required ? `${input.model.label} *` : input.model.label,
      'label',
      decorated,
    )],
    ...optionLines,
    ...errorLines(input, input.model.error, 'error', decorated),
  ];
}

function choiceLine(
  input: ComponentMeasureInput<ChoiceModel> | ComponentRenderInput<ChoiceModel, ChoiceStylePart>,
  option: PreparedChoice,
  spans: readonly RenderSpan[],
  decorated: boolean,
  state: 'disabled' | 'hovered' | 'pressed' | undefined,
): readonly RenderSpan[] {
  if (!decorated || !('style' in input)) return spans;
  const used = measureRenderSpans(spans, { widthProfile: input.widthProfile });
  if (used >= input.bounds.width) return spans;
  return [
    ...spans,
    choiceSpan(
      input,
      ' '.repeat(input.bounds.width - used),
      'option',
      `option.${option.id}.padding`,
      true,
      state,
      'content',
    ),
  ];
}

function choiceSpan(
  input: ComponentMeasureInput<ChoiceModel> | ComponentRenderInput<ChoiceModel, ChoiceStylePart>,
  text: string,
  part: ChoiceStylePart,
  description: string,
  decorated: boolean,
  state: 'disabled' | 'hovered' | 'pressed' | undefined,
  cellRole: import('../../visual/source.ts').FrameCellRole = part === 'marker'
    ? 'decoration'
    : 'text',
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const style = input.style({ part, ...(state === undefined ? {} : { state }) });
  const itemId = description.split('.')[1];
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.source({
      partName: part,
      partType: part,
      description,
      cellRole,
      ...(itemId === undefined ? {} : { itemId }),
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  });
}

function checkboxChoiceKeys(model: ChoiceModel): ElementKeyBindings<CheckboxGroupAction> {
  const active = activeChoice(model);
  return {
    arrowUp: () => ({ kind: 'moveActive' as const, delta: -1 }),
    arrowDown: () => ({ kind: 'moveActive' as const, delta: 1 }),
    home: () => ({ kind: 'firstActive' as const }),
    end: () => ({ kind: 'lastActive' as const }),
    ...(active === undefined ? {} : {
      enter: () => ({ kind: 'toggleSelection' as const, id: active.id }),
      space: () => ({ kind: 'toggleSelection' as const, id: active.id }),
    }),
  };
}

function radioChoiceKeys(model: ChoiceModel): ElementKeyBindings<RadioGroupAction> {
  const active = activeChoice(model);
  return {
    arrowUp: () => ({ kind: 'moveActive' as const, delta: -1 }),
    arrowDown: () => ({ kind: 'moveActive' as const, delta: 1 }),
    home: () => ({ kind: 'firstActive' as const }),
    end: () => ({ kind: 'lastActive' as const }),
    ...(active === undefined ? {} : {
      enter: () => ({ kind: 'commitActive' as const }),
      space: () => ({ kind: 'commitActive' as const }),
    }),
  };
}

function activeChoice(model: ChoiceModel): PreparedChoice | undefined {
  return model.options.find((option) => option.id === model.interaction.activeId && !option.disabled) ??
    model.options.find((option) => !option.disabled);
}

function checkboxChoiceHitTargets(
  input: ComponentInput<ChoiceModel>,
): readonly HitTarget<CheckboxGroupAction>[] {
  return choiceRows(input).map(({ option, bounds }) => ({
    id: `${input.id ?? 'checkbox'}:${option.id}`,
    bounds,
    cursor: 'pointer' as const,
    focus: { kind: 'target' as const, targetId: 'self' },
    message: () => ({ kind: 'toggleSelection' as const, id: option.id }),
  }));
}

function radioChoiceHitTargets(
  input: ComponentInput<ChoiceModel>,
): readonly HitTarget<RadioGroupAction>[] {
  return choiceRows(input).map(({ option, bounds }) => ({
    id: `${input.id ?? 'radio'}:${option.id}`,
    bounds,
    cursor: 'pointer' as const,
    focus: { kind: 'target' as const, targetId: 'self' },
    message: () => ({ kind: 'select' as const, id: option.id }),
  }));
}

function choiceRows(input: ComponentInput<ChoiceModel>) {
  let row = 1;
  return input.model.options.flatMap((option) => {
    const current = row;
    row += option.description === undefined ? 1 : 2;
    return option.disabled ? [] : [{
      option,
      bounds: {
        row: current,
        column: 0,
        width: input.bounds.width,
        height: option.description === undefined ? 1 : 2,
      },
    }];
  });
}

function choiceAccessibility(
  input: import('../../component/index.ts').ComponentAccessibilityInput<ChoiceModel>,
  kind: 'checkbox' | 'radio',
): AccessibleNode {
  const selected = new Set(choiceSelectedIds(input.model.interaction.selection));
  return {
    id: input.id,
    role: kind === 'radio' ? 'radiogroup' as const : 'group' as const,
    label: input.model.label || input.id,
    ...(input.model.error === '' ? {} : { description: input.model.error }),
    ...(input.focused ? { focused: true } : {}),
    children: input.model.options.map((option) => ({
      id: `${input.id}:option:${option.id}`,
      role: kind,
      label: option.label,
      checked: selected.has(option.id),
      ...(option.description === undefined ? {} : { description: option.description }),
      ...(input.disabled || option.disabled ? { disabled: true } : {}),
    })),
  };
}

function prepareSwatches(
  value: Readonly<Omit<ColorSwatchPickerOptions<unknown, ComponentMessage>, 'id' | 'disabled' | 'onAction' | 'meta'>>,
  pointerAvailable: boolean,
): SwatchModel {
  const options = value.options.map((item, index): PreparedSwatch => {
    const base = prepareChoice(item, `colorSwatchPicker options[${String(index)}]`);
    const swatch = optionalString(item.swatch, 'colorSwatchPicker swatch') ?? '■';
    if (terminalTextWidth(swatch) !== 1) {
      throw new RangeError('colorSwatchPicker swatch must occupy one terminal cell.');
    }
    return {
      ...base,
      swatch,
      ...(item.style === undefined ? {} : {
        swatchStyle: prepareTerminalStyle(
          item.style,
          `colorSwatchPicker options[${String(index)}].style`,
        ),
      }),
    };
  });
  assertUnique(options, 'colorSwatchPicker');
  const columns = value.columns === undefined
    ? Math.max(1, Math.min(8, options.length || 1))
    : positiveInteger(value.columns, 'colorSwatchPicker columns');
  const interaction = prepareChoiceInteraction(
    value.presentation,
    'single',
    'colorSwatchPicker',
    options.map((option) => option.id),
  );
  const pointerState = preparePointer(value.pointerState, 'colorSwatchPicker', pointerAvailable);
  return {
    label: cleanString(value.label, 'colorSwatchPicker label'),
    options,
    interaction,
    columns,
    error: optionalString(value.error, 'colorSwatchPicker error') ?? '',
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function swatchLines(
  input: ComponentMeasureInput<SwatchModel> | ComponentRenderInput<SwatchModel, PickerStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const selected = selectedSwatch(input.model);
  const label = input.model.label === ''
    ? []
    : [[controlSpan(input, input.model.label, 'label', 'label', decorated)]];
  const summary = selected === undefined ? [] : [[
    controlSpan(input, 'Selected', 'summary', 'summary.label', decorated, undefined, 'text'),
    controlSpan(input, ': ', 'summary', 'summary.separator', decorated, undefined, 'separator'),
    controlSpan(
      input,
      oneCellGlyph(selected.swatch, '*', { widthProfile: input.widthProfile }),
      'swatch',
      'summary.swatch',
      decorated,
      swatchStyle(selected),
      'decoration',
    ),
    controlSpan(input, ' ', 'summary', 'summary.gap', decorated, undefined, 'separator'),
    controlSpan(
      input,
      selected.label,
      'summary',
      'summary.value',
      decorated,
      swatchStyle(selected),
      'text',
    ),
  ]];
  const rows = Array.from(
    { length: Math.ceil(input.model.options.length / input.model.columns) },
    (_unused, row) =>
      input.model.options
        .slice(row * input.model.columns, (row + 1) * input.model.columns)
        .flatMap((option) => swatchOptionSpans(input, option, decorated)),
  );
  return [
    ...label,
    ...summary,
    ...rows,
    ...errorLines(input, input.model.error, 'error', decorated),
  ];
}

function pickerKeys(model: SwatchModel): ElementKeyBindings<ColorSwatchPickerAction> {
  const active = model.options.find((option) => option.id === model.interaction.activeId && !option.disabled) ??
    model.options.find((option) => !option.disabled);
  return {
    arrowLeft: () => ({ kind: 'moveActive' as const, delta: -1 }),
    arrowRight: () => ({ kind: 'moveActive' as const, delta: 1 }),
    arrowUp: () => ({ kind: 'moveActive' as const, delta: -model.columns }),
    arrowDown: () => ({ kind: 'moveActive' as const, delta: model.columns }),
    home: () => ({ kind: 'firstActive' as const }),
    end: () => ({ kind: 'lastActive' as const }),
    ...(active === undefined ? {} : {
      enter: () => ({ kind: 'commitActive' as const }),
      space: () => ({ kind: 'commitActive' as const }),
    }),
  };
}

function selectedSwatch(model: SwatchModel): PreparedSwatch | undefined {
  const selectedId = singleSelectedId(model.interaction.selection);
  return selectedId === undefined
    ? undefined
    : model.options.find((option) => option.id === selectedId);
}

function swatchStyle(option: PreparedSwatch): TerminalStyle {
  return option.swatchStyle ?? {
    fg: { kind: 'theme', token: 'control.primary.foreground' },
    bg: { kind: 'theme', token: 'control.primary.background' },
  };
}

function swatchOptionSpans(
  input: ComponentMeasureInput<SwatchModel> | ComponentRenderInput<SwatchModel, PickerStylePart>,
  option: PreparedSwatch,
  decorated: boolean,
): readonly RenderSpan[] {
  const selected = isChoiceSelected(input.model.interaction.selection, option.id);
  const state = input.disabled || option.disabled ? 'disabled' : selected ? 'selected' : undefined;
  const label = padTextCells(
    clipTextCells(option.label, 8, { ellipsis: '…', widthProfile: input.widthProfile }).text,
    8,
    { widthProfile: input.widthProfile },
  );
  return [
    controlSpan(
      input,
      selected ? '[' : ' ',
      'option',
      `option.${option.id}.open`,
      decorated,
      undefined,
      'decoration',
      state,
    ),
    controlSpan(
      input,
      oneCellGlyph(option.swatch, '*', { widthProfile: input.widthProfile }),
      'swatch',
      `option.${option.id}.swatch`,
      decorated,
      swatchStyle(option),
      'decoration',
      state,
    ),
    controlSpan(
      input,
      ' ',
      'option',
      `option.${option.id}.separator`,
      decorated,
      undefined,
      'separator',
      state,
    ),
    controlSpan(
      input,
      label,
      'option',
      `option.${option.id}.label`,
      decorated,
      option.swatchStyle,
      'text',
      state,
    ),
    controlSpan(
      input,
      selected ? ']' : ' ',
      'option',
      `option.${option.id}.close`,
      decorated,
      undefined,
      'decoration',
      state,
    ),
  ];
}

function prepareCalendar(
  value: Readonly<Omit<CalendarOptions<ComponentMessage>, 'id' | 'disabled' | 'onAction' | 'meta'>>,
  pointerAvailable: boolean,
): CalendarModel {
  if (!isNonArrayObject(value.presentation)
    || !Array.isArray(value.presentation.weekdays)
    || !Array.isArray(value.presentation.days)) {
    throw new TypeError('calendar options are invalid.');
  }
  if (value.presentation.weekdays.length !== 7) {
    throw new RangeError('calendar weekdays must contain seven labels.');
  }
  const weekdays = value.presentation.weekdays.map((day, index) =>
    cleanString(day, `calendar weekdays[${String(index)}]`)
  );
  const days = value.presentation.days.map((day, index): PreparedDay => {
    if (!isNonArrayObject(day) || !isNonArrayObject(day['date'])) {
      throw new TypeError(`calendar days[${String(index)}] is invalid.`);
    }
    const date = day['date'];
    const year = positiveInteger(date['year'], 'calendar year');
    const month = positiveInteger(date['month'], 'calendar month');
    const dateDay = positiveInteger(date['day'], 'calendar day');
    if (month > 12 || dateDay > 31) throw new RangeError('calendar date is invalid.');
    return {
      id: cleanString(day['id'], 'calendar day id'),
      label: cleanString(day['label'], 'calendar day label'),
      date: { year, month, day: dateDay },
      disabled: optionalBoolean(day['disabled'], 'calendar day disabled') ?? false,
      hidden: optionalBoolean(day['hidden'], 'calendar day hidden') ?? false,
      ...(day['today'] === true ? { today: true } : {}),
      ...(day['outsideMonth'] === true ? { outsideMonth: true } : {}),
    };
  });
  assertUnique(days, 'calendar');
  const interaction = prepareChoiceInteraction(
    value.presentation.interaction,
    'single',
    'calendar',
    days.map((day) => day.id),
  );
  const pointerState = preparePointer(value.pointerState, 'calendar', pointerAvailable);
  return {
    label: cleanString(value.label, 'calendar label'),
    monthLabel: cleanString(value.presentation.monthLabel, 'calendar monthLabel'),
    weekdays,
    days,
    interaction,
    error: optionalString(value.error, 'calendar error') ?? '',
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function calendarLines(
  input:
    | ComponentMeasureInput<CalendarModel>
    | ComponentRenderInput<CalendarModel, PickerStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const days = input.model.days.filter((day) => !day.hidden);
  const month = input.disabled
    ? [controlSpan(input, input.model.monthLabel, 'month', 'month.label', decorated)]
    : [
      controlSpan(input, ' ‹ ', 'option', 'month.previous', decorated, undefined, 'decoration'),
      controlSpan(input, ' ', 'option', 'month.previous.gap', decorated, undefined, 'separator'),
      controlSpan(input, input.model.monthLabel, 'month', 'month.label', decorated),
      controlSpan(input, ' ', 'option', 'month.next.gap', decorated, undefined, 'separator'),
      controlSpan(input, ' › ', 'option', 'month.next', decorated, undefined, 'decoration'),
    ];
  const weekdays = input.model.weekdays.flatMap((day, index) => [controlSpan(
    input,
    ` ${
      padTextCells(clipTextCells(day, 2, { widthProfile: input.widthProfile }).text, 2, {
        widthProfile: input.widthProfile,
      })
    } `,
    'weekday',
    `weekday.${String(index)}`,
    decorated,
    { fg: { kind: 'theme', token: 'text.disabled' }, dim: true },
  )]);
  const rows = Array.from(
    { length: Math.ceil(days.length / 7) },
    (_unused, row) =>
      days.slice(row * 7, (row + 1) * 7).flatMap((day) => calendarDaySpans(input, day, decorated)),
  );
  return [
    ...(input.model.label === ''
      ? []
      : [[controlSpan(input, input.model.label, 'label', 'label', decorated)]]),
    month,
    weekdays,
    ...rows,
    ...errorLines(input, input.model.error, 'error', decorated),
  ];
}

function calendarDaySpans(
  input:
    | ComponentMeasureInput<CalendarModel>
    | ComponentRenderInput<CalendarModel, PickerStylePart>,
  day: PreparedDay,
  decorated: boolean,
): readonly RenderSpan[] {
  const selected = isChoiceSelected(input.model.interaction.selection, day.id);
  const state = input.disabled || day.disabled || day.outsideMonth === true
    ? 'disabled'
    : selected
    ? 'selected'
    : day.id === input.model.interaction.activeId || day.today === true
    ? 'focused'
    : undefined;
  const label = padTextCells(
    clipTextCells(day.label, 2, { widthProfile: input.widthProfile }).text,
    2,
    { align: 'end', widthProfile: input.widthProfile },
  );
  const open = selected ? '[' : day.today === true ? '*' : ' ';
  const close = selected ? ']' : ' ';
  return [
    controlSpan(
      input,
      open,
      'option',
      `day.${day.id}.${selected ? 'open' : day.today === true ? 'today' : 'leading'}`,
      decorated,
      undefined,
      'decoration',
      state,
    ),
    controlSpan(input, label, 'option', `day.${day.id}.label`, decorated, undefined, 'text', state),
    controlSpan(
      input,
      close,
      'option',
      `day.${day.id}.${selected ? 'close' : 'trailing'}`,
      decorated,
      undefined,
      'decoration',
      state,
    ),
  ];
}

function activeDay(model: CalendarModel): PreparedDay | undefined {
  return model.days.find((day) =>
    day.id === model.interaction.activeId && !day.disabled && !day.hidden
  );
}

function calendarHitTargets(
  input: ComponentInput<CalendarModel>,
): readonly HitTarget<CalendarAction>[] {
  let visible = 0;
  const monthRow = input.model.label === '' ? 0 : 1;
  const monthLabelWidth =
    measureTextCells(input.model.monthLabel, { widthProfile: input.widthProfile }).cells;
  const previousWidth = Math.min(3, input.bounds.width);
  const nextColumn = Math.min(Math.max(0, input.bounds.width - 3), 4 + monthLabelWidth);
  const nextWidth = Math.min(3, Math.max(0, input.bounds.width - nextColumn));
  const navigation = input.disabled || input.bounds.height <= monthRow ? [] : [
    {
      id: `${input.id ?? 'calendar'}:month:previous`,
      bounds: { row: monthRow, column: 0, width: previousWidth, height: 1 },
      cursor: 'pointer' as const,
      message: () => ({ kind: 'moveMonth' as const, months: -1 as const }),
    },
    ...(nextWidth === 0 ? [] : [{
      id: `${input.id ?? 'calendar'}:month:next`,
      bounds: { row: monthRow, column: nextColumn, width: nextWidth, height: 1 },
      cursor: 'pointer' as const,
      message: () => ({ kind: 'moveMonth' as const, months: 1 as const }),
    }]),
  ];
  const dayRowOffset = monthRow + 2;
  const days = input.model.days.flatMap((day) => {
    if (day.hidden) return [];
    const index = visible++;
    const column = (index % 7) * 4;
    return day.disabled || column >= input.bounds.width ? [] : [{
      id: `${input.id ?? 'calendar'}:${day.id}`,
      bounds: {
        row: dayRowOffset + Math.floor(index / 7),
        column,
        width: Math.min(4, input.bounds.width - column),
        height: 1,
      },
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: () => ({ kind: 'select' as const, date: day.date }),
    }];
  });
  return [...navigation, ...days];
}

type TextEntryFactory<TOptions extends object> = SemanticLeafComponentFactory<
  TOptions,
  TextInputAction | PointerLifecycleAction,
  TextEntryStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles']
>;

type TextInputComponentOptions = Omit<
  TextInputOptions<ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'onAction' | 'onPointerAction' | 'meta'
>;
type PasswordInputComponentOptions = Omit<
  PasswordInputOptions<ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'onAction' | 'onPointerAction' | 'meta'
>;

function textEntryDefinition<
  TOptions extends TextInputComponentOptions | PasswordInputComponentOptions,
>(
  name: 'text-input' | 'password-input',
  password: boolean,
): TextEntryFactory<TOptions> {
  return defineComponent<
    TOptions,
    TextEntryModel,
    TextInputAction | PointerLifecycleAction,
    TextEntryStylePart,
    readonly ['disabled', 'readOnly'],
    'required',
    readonly ['focus', 'layer', 'styles']
  >({
    name: `terminal-ui/components/${name}`,
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'textbox',
    states: ['disabled', 'readOnly'],
    metadata: ['focus', 'layer', 'styles'],
    parts: ['border', 'label', 'value', 'placeholder', 'selection', 'cursor', 'error'],
    sensitiveInput: password,
    prepare: (value, context) => prepareTextEntry(
      value,
      name,
      password,
      !context.disabled && !context.inert,
    ),
    measure(input) {
      const shown = input.model.displayedValue === ''
        ? input.model.placeholder
        : input.model.displayedValue;
      return {
        minWidth: 2,
        minHeight: 1,
        preferredWidth: 2 + measureTextCells(shown, { widthProfile: input.widthProfile }).cells,
        preferredHeight: 1 + (input.model.error === '' ? 0 : 1),
      };
    },
    render: paintTextEntry,
    keys: ({ model, readOnly }) => ({
      triggers: textEditingTriggers(readOnly, false),
      ...(readOnly ? {} : {
        backspace: () => edit('deleteBackward'),
        delete: () => edit('deleteForward'),
      }),
      arrowLeft: () => edit('moveLeft'),
      arrowRight: () => edit('moveRight'),
      home: () => edit('moveHome'),
      end: () => edit('moveEnd'),
      enter: () => ({ kind: 'submit', value: model.sourceValue }),
    }),
    onInput: ({ text, readOnly }) =>
      readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
    onPaste: ({ text, readOnly }) =>
      readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
    pointer: {
      state: ({ model }) => model.pointerState,
      onAction: (action) => ({ kind: 'pointerLifecycle', action }),
    },
    focusTargets: (input) => {
      const cursorStyle = input.style({
        part: 'cursor',
        state: 'focused',
        base: {
          fg: { kind: 'theme', token: 'input.cursor' },
          bold: true,
          inverse: true,
        },
      });
      return [{
        id: 'self',
        bounds: input.bounds,
        cursor: {
          row: 0,
          column: Math.max(
            0,
            Math.min(
              Math.max(0, input.bounds.width - 1),
              2 +
                textPrefixCells(
                  input.model.displayedValue,
                  input.model.presentation.cursor,
                  input.widthProfile,
                ),
            ),
          ),
          ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
          source: input.source({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
        },
      }];
    },
    hitTargets(input) {
      const bounds = { ...input.bounds, height: Math.min(1, input.bounds.height) };
      if (bounds.width === 0 || bounds.height === 0) return [];
      const offsetAt = (event: RoutedPointerEvent): number =>
        sourceOffsetAtColumn(
          input.model,
          Math.max(0, (event.localColumn ?? event.column + 1) - 3),
          input.widthProfile,
        );
      return [{
        id: `${input.id ?? name}:text`,
        bounds,
        accepts: ['pointerDown', 'dragStart', 'drag', 'dragEnd'],
        cursor: 'text',
        focus: { kind: 'target', targetId: 'self' },
        message(event) {
          const offset = offsetAt(event);
          if (event.kind === 'pointerDown') {
            return { kind: 'pointer', action: { kind: 'placeCaret', offset } };
          }
          if (event.kind !== 'dragStart' && event.kind !== 'drag' && event.kind !== 'dragEnd') {
            return ignoreMessage();
          }
          const anchor = sourceOffsetAtColumn(
            input.model,
            Math.max(0, (event.pressLocalColumn ?? event.localColumn ?? event.column + 1) - 3),
            input.widthProfile,
          );
          return {
            kind: 'pointer',
            action: {
              kind: event.kind === 'dragEnd' ? 'endSelection' : 'extendSelection',
              anchor,
              offset,
            },
          };
        },
      }];
    },
    accessibility: ({ id, model, focused }) => ({
      id,
      role: 'textbox',
      label: id,
      required: model.required,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(password ? {} : { value: model.sourceValue }),
      ...(
        password || model.required || model.error !== ''
          ? {
            description: [
              password ? 'Password input.' : '',
              model.required ? 'Required.' : '',
              model.error,
            ].filter(Boolean).join(' '),
          }
          : {}
      ),
      ...(focused ? { focused: true } : {}),
    }),
  });
}

function prepareTextEntry(
  value: Readonly<TextInputComponentOptions | PasswordInputComponentOptions>,
  owner: string,
  password: boolean,
  pointerAvailable: boolean,
): TextEntryModel {
  if (!isNonArrayObject(value.presentation)) {
    throw new TypeError(`${owner} presentation must be an object.`);
  }
  const presentation = prepareTextPresentation(value.presentation, owner);
  const mask = password
    ? optionalString('mask' in value ? value.mask : undefined, `${owner} mask`) ?? '•'
    : undefined;
  if (
    mask !== undefined && (segmentGraphemes(mask).length !== 1 || terminalTextWidth(mask) !== 1)
  ) throw new RangeError('passwordInput mask must be one printable one-cell grapheme.');
  const graphemes = segmentGraphemes(presentation.value);
  const displayedValue = mask === undefined ? presentation.value : mask.repeat(graphemes.length);
  const displayedCursor = mask === undefined
    ? presentation.cursor
    : graphemes.filter((part) => part.endOffsetExclusive <= presentation.cursor).length *
      mask.length;
  const selection = presentation.selection;
  const displayedSelection = selection === undefined
    ? undefined
    : mask === undefined
    ? selection
    : {
      startOffset:
        graphemes.filter((part) => part.endOffsetExclusive <= selection.startOffset).length *
        mask.length,
      endOffsetExclusive:
        graphemes.filter((part) => part.endOffsetExclusive <= selection.endOffsetExclusive).length *
        mask.length,
    };
  const pointerState = preparePointer(value.pointerState, owner, pointerAvailable);
  return {
    presentation: { ...presentation, cursor: displayedCursor },
    displayedValue,
    placeholder: optionalString(value.placeholder, `${owner} placeholder`) ?? '',
    required: optionalBoolean(value.required, `${owner} required`) ?? false,
    error: optionalString(value.error, `${owner} error`) ?? '',
    sourceValue: presentation.value,
    ...(displayedSelection === undefined ? {} : { displayedSelection }),
    ...(mask === undefined ? {} : { maskCodeUnits: mask.length }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareTextPresentation(
  value: TextInputPresentation,
  owner: string,
): TextInputPresentation {
  const raw = cleanString(value.value, `${owner} value`);
  const cursor = nonNegativeInteger(value.cursor, `${owner} cursor`);
  if (cursor > raw.length) throw new RangeError(`${owner} cursor exceeds value length.`);
  const selection = prepareTextSelection(value.selection, raw, owner);
  return { value: raw, cursor, ...(selection === undefined ? {} : { selection }) };
}

function prepareTextSelection(
  value: TextSelection | undefined,
  text: string,
  owner: string,
): TextSelection | undefined {
  if (value === undefined) return undefined;
  if (
    !isNonArrayObject(value) ||
    typeof value.startOffset !== 'number' ||
    typeof value.endOffsetExclusive !== 'number' ||
    !Number.isSafeInteger(value.startOffset) ||
    !Number.isSafeInteger(value.endOffsetExclusive)
  ) {
    throw new TypeError(`${owner} selection is invalid.`);
  }
  return normalizeTextSelection(text, {
    startOffset: value.startOffset,
    endOffsetExclusive: value.endOffsetExclusive,
  });
}

function paintTextEntry(input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>): void {
  if (input.bounds.width === 0 || input.bounds.height === 0) return;
  const marker = input.disabled
    ? ' '
    : input.model.error !== ''
    ? input.theme.tokens.symbols.statusError
    : input.focus === 'self'
    ? input.theme.tokens.symbols.pointer
    : input.theme.tokens.colors['control.background'] === undefined
    ? input.theme.tokens.symbols.borderSingle.vertical
    : ' ';
  const borderStyle = input.style({
    part: 'border',
    base: {
      fg: { kind: 'theme', token: input.model.error === '' ? 'control.border' : 'status.error' },
      bg: { kind: 'theme', token: 'control.background' },
      ...(input.model.error === '' ? {} : { bold: true }),
    },
    ...(input.disabled
      ? { state: 'disabled' as const }
      : input.focus === 'self'
      ? { state: 'focused' as const }
      : {}),
  });
  const usesPlaceholder = input.model.displayedValue === '' && input.model.placeholder !== '';
  const shown = usesPlaceholder ? input.model.placeholder : input.model.displayedValue;
  const valueStyle = input.style({
    part: usesPlaceholder ? 'placeholder' : 'value',
    base: {
      fg: { kind: 'theme', token: usesPlaceholder ? 'input.placeholder' : 'control.foreground' },
      bg: { kind: 'theme', token: 'control.background' },
      ...(usesPlaceholder ? { dim: true } : {}),
    },
    ...(input.disabled ? { state: 'disabled' as const } : {}),
  });
  const selectionStyle = input.style({
    part: 'selection',
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
    state: 'selected',
  });
  const spans: RenderSpan[] = [span(`${marker} `, {
    ...(borderStyle === undefined ? {} : { style: borderStyle }),
    source: input.source({
      cellRole: 'decoration',
      partName: 'border',
      partType: 'frame',
      description: 'frame.prefix',
    }),
  })];
  if (usesPlaceholder || input.model.displayedSelection === undefined) {
    spans.push(span(shown, {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.source({
        cellRole: 'text',
        partName: usesPlaceholder ? 'placeholder' : 'value',
        partType: usesPlaceholder ? 'placeholder' : 'value',
        description: usesPlaceholder ? 'placeholder' : 'value',
      }),
    }));
  } else {
    const selection = input.model.displayedSelection;
    const records = [
      { start: 0, end: selection.startOffset, selected: false },
      { start: selection.startOffset, end: selection.endOffsetExclusive, selected: true },
      { start: selection.endOffsetExclusive, end: shown.length, selected: false },
    ];
    for (const record of records) {
      const current = shown.slice(record.start, record.end);
      if (current === '') continue;
      spans.push(span(current, {
        ...(record.selected
          ? selectionStyle === undefined ? {} : { style: selectionStyle }
          : valueStyle === undefined
          ? {}
          : { style: valueStyle }),
        source: input.source({
          cellRole: 'text',
          partName: record.selected ? 'selection' : 'value',
          partType: record.selected ? 'selection' : 'value',
          description: record.selected ? 'selection' : 'value',
        }),
      }));
    }
  }
  const occupied = 2 + measureTextCells(shown, { widthProfile: input.widthProfile }).cells;
  const padding = Math.max(0, input.bounds.width - occupied);
  if (padding > 0) {
    spans.push(span(' '.repeat(padding), {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.source({
        cellRole: 'content',
        partName: 'value',
        partType: 'value',
        description: 'value.padding',
      }),
    }));
  }
  input.target.write(
    0,
    0,
    clipRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile }),
  );
  if (input.model.error !== '' && input.bounds.height > 1) {
    const errorStyle = input.style({
      part: 'error',
      base: { fg: { kind: 'theme', token: 'status.error' }, bold: true },
    });
    input.target.write(1, 0, [span(input.model.error, {
      ...(errorStyle === undefined ? {} : { style: errorStyle }),
      source: input.source({
        cellRole: 'text',
        partName: 'error',
        partType: 'error',
        description: 'validation.error',
      }),
    })]);
  }
}

function sourceOffsetAtColumn(
  model: TextEntryModel,
  column: number,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): number {
  const displayed = segmentGraphemes(model.displayedValue);
  let cells = 0;
  let index = 0;
  for (const grapheme of displayed) {
    const width = measureTextCells(grapheme.text, { widthProfile }).cells;
    if (cells + width > column) break;
    cells += width;
    index += 1;
  }
  if (model.maskCodeUnits === undefined) {
    return displayed[index]?.startOffset ?? model.sourceValue.length;
  }
  const source = segmentGraphemes(model.sourceValue);
  return source[index]?.startOffset ?? model.sourceValue.length;
}

function prepareNumberInput(
  value: Readonly<Omit<NumberInputOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onAction' | 'meta'>>,
  pointerAvailable: boolean,
): NumberModel {
  if (!isNonArrayObject(value.presentation)) {
    throw new TypeError('numberInput presentation must be an object.');
  }
  const raw = value.presentation;
  const text = cleanString(raw.value, 'numberInput value');
  const cursor = nonNegativeInteger(raw.cursor, 'numberInput cursor');
  if (cursor > text.length) throw new RangeError('numberInput cursor exceeds value length.');
  const selection = prepareTextSelection(raw.selection, text, 'numberInput');
  const validity = raw.validity;
  if (!isStringMember(validity, ['empty', 'incomplete', 'invalid', 'valid', 'outOfRange'])) {
    throw new TypeError('numberInput validity is invalid.');
  }
  const parsedValue = raw.parsedValue;
  const min = optionalFinite(raw.min, 'numberInput min');
  const max = optionalFinite(raw.max, 'numberInput max');
  const step = optionalFinite(raw.step, 'numberInput step');
  const committedValue = optionalFinite(raw.committedValue, 'numberInput committedValue');
  const common = {
    value: text,
    cursor,
    ...(selection === undefined ? {} : { selection }),
    ...(committedValue === undefined ? {} : { committedValue }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(step === undefined ? {} : { step }),
  };
  let presentation: NumberInputPresentation;
  if (validity === 'valid' || validity === 'outOfRange') {
    if (typeof parsedValue !== 'number' || !Number.isFinite(parsedValue)) {
      throw new TypeError('numberInput parsedValue must be finite for a numeric validity.');
    }
    presentation = { ...common, validity, parsedValue };
  } else {
    presentation = { ...common, validity };
  }
  const pointerState = preparePointer(value.pointerState, 'numberInput', pointerAvailable);
  return {
    presentation,
    placeholder: optionalString(value.placeholder, 'numberInput placeholder') ?? '',
    required: optionalBoolean(value.required, 'numberInput required') ?? false,
    error: optionalString(value.error, 'numberInput error') ?? '',
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

const numberStepperWidth = 8;

function measureNumberInput(input: ComponentMeasureInput<NumberModel>): Measurement {
  const shown = input.model.presentation.value === ''
    ? input.model.placeholder
    : input.model.presentation.value;
  return {
    minWidth: 2,
    minHeight: 1,
    preferredWidth: 2 +
      measureTextCells(shown, { widthProfile: input.widthProfile }).cells +
      (input.disabled || input.readOnly ? 0 : numberStepperWidth),
    preferredHeight: 1 + (input.model.error === '' ? 0 : 1),
  };
}

function paintNumberInput(input: ComponentRenderInput<NumberModel, NumberInputStylePart>): void {
  if (input.bounds.width === 0 || input.bounds.height === 0) return;
  const geometry = numberInputGeometry(input.bounds, input.disabled || input.readOnly);
  const inputBounds = geometry?.input ?? input.bounds;
  const usesPlaceholder = input.model.presentation.value === '' && input.model.placeholder !== '';
  const shown = usesPlaceholder ? input.model.placeholder : input.model.presentation.value;
  const marker = input.disabled
    ? ' '
    : input.model.error !== ''
    ? input.theme.tokens.symbols.statusError
    : input.focus === 'self'
    ? input.theme.tokens.symbols.pointer
    : input.theme.tokens.colors['control.background'] === undefined
    ? input.theme.tokens.symbols.borderSingle.vertical
    : ' ';
  const borderStyle = input.style({
    part: 'border',
    base: {
      fg: { kind: 'theme', token: input.model.error === '' ? 'control.border' : 'status.error' },
      bg: { kind: 'theme', token: 'control.background' },
    },
    ...(input.disabled
      ? { state: 'disabled' as const }
      : input.focus === 'self'
      ? { state: 'focused' as const }
      : {}),
  });
  const valueStyle = input.style({
    part: usesPlaceholder ? 'placeholder' : 'value',
    base: {
      fg: { kind: 'theme', token: usesPlaceholder ? 'input.placeholder' : 'control.foreground' },
      bg: { kind: 'theme', token: 'control.background' },
      ...(usesPlaceholder ? { dim: true } : {}),
    },
    ...(input.disabled ? { state: 'disabled' as const } : {}),
  });
  const selectionStyle = input.style({
    part: 'selection',
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
    state: 'selected',
  });
  const contentSpans: RenderSpan[] = [];
  const selection = usesPlaceholder ? undefined : input.model.presentation.selection;
  if (selection === undefined) {
    contentSpans.push(span(shown, {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.source({
        cellRole: 'text',
        partName: usesPlaceholder ? 'placeholder' : 'value',
        partType: usesPlaceholder ? 'placeholder' : 'value',
        description: usesPlaceholder ? 'placeholder' : 'value',
      }),
    }));
  } else {
    for (const range of [
      { start: 0, end: selection.startOffset, selected: false },
      { start: selection.startOffset, end: selection.endOffsetExclusive, selected: true },
      { start: selection.endOffsetExclusive, end: shown.length, selected: false },
    ]) {
      const text = shown.slice(range.start, range.end);
      if (text === '') continue;
      contentSpans.push(span(text, {
        ...(range.selected
          ? selectionStyle === undefined ? {} : { style: selectionStyle }
          : valueStyle === undefined ? {} : { style: valueStyle }),
        source: input.source({
          cellRole: 'text',
          partName: range.selected ? 'selection' : 'value',
          partType: range.selected ? 'selection' : 'value',
          description: range.selected ? 'selection' : 'value',
        }),
      }));
    }
  }
  const valueSpans = clipRenderSpans(
    [
      span(`${marker} `, {
        ...(borderStyle === undefined ? {} : { style: borderStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'border',
          partType: 'frame',
          description: 'frame.prefix',
        }),
      }),
      ...contentSpans,
    ],
    inputBounds.width,
    { widthProfile: input.widthProfile },
  );
  const used = measureRenderSpans(valueSpans, { widthProfile: input.widthProfile });
  input.target.write(0, 0, [
    ...valueSpans,
    ...(used >= inputBounds.width ? [] : [span(' '.repeat(inputBounds.width - used), {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.source({
        cellRole: 'content',
        partName: 'value',
        partType: 'value',
        description: 'value.padding',
      }),
    })]),
  ]);
  if (geometry !== undefined) {
    const stepperStyle = input.style({ part: 'stepper' });
    input.target.write(0, inputBounds.width, [
      span('  ', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'separator',
          description: 'step.separator.before',
        }),
      }),
      span('−', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'decrement',
          description: 'step.decrement',
        }),
      }),
      span('  ', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'separator',
          description: 'step.separator.between',
        }),
      }),
      span('+', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'increment',
          description: 'step.increment',
        }),
      }),
      span(' ', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'separator',
          description: 'step.separator.after',
        }),
      }),
    ]);
  }
  if (input.model.error !== '' && input.bounds.height > 1) {
    const errorStyle = input.style({
      part: 'error',
      base: { fg: { kind: 'theme', token: 'status.error' }, bold: true },
    });
    input.target.write(
      1,
      0,
      clipRenderSpans(
        [span(input.model.error, {
          ...(errorStyle === undefined ? {} : { style: errorStyle }),
          source: input.source({
            cellRole: 'text',
            partName: 'error',
            partType: 'error',
            description: 'validation.error',
          }),
        })],
        input.bounds.width,
        { widthProfile: input.widthProfile },
      ),
    );
  }
}

function numberInputHitTargets(
  input: ComponentInput<NumberModel>,
): readonly HitTarget<NumberInputControlAction>[] {
  const geometry = numberInputGeometry(input.bounds, input.disabled || input.readOnly);
  const inputBounds = geometry?.input ?? input.bounds;
  const focusTarget = {
    id: `${input.id ?? 'number-input'}:input`,
    bounds: inputBounds,
    cursor: 'text' as const,
    focus: { kind: 'target' as const, targetId: 'self' },
    message: () => ignoreMessage(),
  };
  if (geometry === undefined) {
    return inputBounds.width === 0 || inputBounds.height === 0 ? [] : [focusTarget];
  }
  return [
    focusTarget,
    {
      id: `${input.id ?? 'number-input'}:step:decrement`,
      bounds: geometry.decrement,
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: () => ({ kind: 'step' as const, direction: 'decrement' as const }),
    },
    {
      id: `${input.id ?? 'number-input'}:step:increment`,
      bounds: geometry.increment,
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: () => ({ kind: 'step' as const, direction: 'increment' as const }),
    },
  ];
}

function numberInputGeometry(bounds: ComponentInput<NumberModel>['bounds'], disabled: boolean) {
  if (disabled || bounds.width < numberStepperWidth || bounds.height === 0) return undefined;
  return {
    input: { ...bounds, width: bounds.width - numberStepperWidth },
    decrement: {
      row: bounds.row,
      column: bounds.column + bounds.width - 7,
      width: 3,
      height: 1,
    },
    increment: {
      row: bounds.row,
      column: bounds.column + bounds.width - 3,
      width: 3,
      height: 1,
    },
  };
}

type SimpleEditKind =
  | 'deleteBackward'
  | 'deleteForward'
  | 'moveLeft'
  | 'moveRight'
  | 'moveHome'
  | 'moveEnd';
function edit(
  kind: SimpleEditKind,
): { readonly kind: 'edit'; readonly operation: TextEditOperation } {
  switch (kind) {
    case 'deleteBackward':
      return { kind: 'edit', operation: { kind: 'deleteBackward' } };
    case 'deleteForward':
      return { kind: 'edit', operation: { kind: 'deleteForward' } };
    case 'moveLeft':
      return { kind: 'edit', operation: { kind: 'moveLeft' } };
    case 'moveRight':
      return { kind: 'edit', operation: { kind: 'moveRight' } };
    case 'moveHome':
      return { kind: 'edit', operation: { kind: 'moveHome' } };
    case 'moveEnd':
      return { kind: 'edit', operation: { kind: 'moveEnd' } };
  }
}

function styled<TModel extends object, TPart extends string>(
  input: ComponentMeasureInput<TModel> | ComponentRenderInput<TModel, TPart>,
  text: string,
  part: TPart,
  decorated: boolean,
  base?: TerminalStyle,
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const style = input.style({ part, ...(base === undefined ? {} : { base }) });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.source({
      partName: part,
      partType: part,
      description: part,
      cellRole: part === 'marker' || part === 'track' || part === 'handle' ? 'decoration' : 'text',
    }),
  });
}

function controlSpan<TModel extends object, TPart extends string>(
  input: ComponentMeasureInput<TModel> | ComponentRenderInput<TModel, TPart>,
  text: string,
  part: TPart,
  description: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/source.ts').FrameCellRole = 'text',
  state?: 'selected' | 'disabled' | 'focused',
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const style = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state }),
  });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.source({ partName: part, partType: part, description, cellRole }),
  });
}

function errorLines<TModel extends object, TPart extends string>(
  input: ComponentMeasureInput<TModel> | ComponentRenderInput<TModel, TPart>,
  error: string,
  part: TPart,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  return error === '' ? [] : [[
    styled(input, error, part, decorated, {
      fg: { kind: 'theme', token: 'status.error' },
      bold: true,
    }),
  ]];
}

function measureLines<TModel extends object>(
  lines: readonly (readonly RenderSpan[])[],
  input: ComponentMeasureInput<TModel>,
): Measurement {
  return {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: lines.reduce(
      (maximum, current) =>
        Math.max(
          maximum,
          current.reduce(
            (total, currentSpan) =>
              total +
              measureTextCells(currentSpan.text, { widthProfile: input.widthProfile }).cells,
            0,
          ),
        ),
      0,
    ),
    preferredHeight: lines.length,
  };
}

function paintLines<TModel extends object, TPart extends string>(
  input: ComponentRenderInput<TModel, TPart>,
  lines: readonly (readonly RenderSpan[])[],
): void {
  lines.slice(0, input.bounds.height).forEach((current, row) => {
    input.target.write(
      row,
      0,
      clipRenderSpans(current, input.bounds.width, { widthProfile: input.widthProfile }),
    );
  });
}

function textPrefixCells(
  value: string,
  offset: number,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): number {
  return measureTextCells(value.slice(0, Math.max(0, Math.min(value.length, offset))), {
    widthProfile,
  }).cells;
}

function cleanString(value: unknown, owner: string): string {
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text;
}
function optionalString(value: unknown, owner: string): string | undefined {
  return value === undefined ? undefined : cleanString(value, owner);
}
function optionalBoolean(value: unknown, owner: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}
function optionalFinite(value: unknown, owner: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${owner} must be finite.`);
  }
  return value;
}
function positiveInteger(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${owner} must be a positive safe integer.`);
  }
  return value;
}
function nonNegativeInteger(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}
function assertUnique(values: readonly { readonly id: string }[], owner: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw new TypeError(`${owner} contains duplicate id "${value.id}".`);
    seen.add(value.id);
  }
}
