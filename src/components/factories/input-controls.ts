import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  decodeTerminalStyle,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  HitTarget,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';
import { textPointerTarget } from '../internal/text-pointer-target.ts';
import {
  layoutSingleLineTextWindow,
} from '../internal/single-line-text-window.ts';
import type { SingleLineTextWindow } from '../internal/single-line-text-window.ts';
import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings } from '../../element/metadata.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { FocusTarget, Measurement } from '../../renderer/index.ts';
import {
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  pointerVisualState,
} from '../../interaction/pointer-interaction.ts';
import {
  decodeSelectionState,
  type CollectionInteractionState,
  type SelectionState,
} from '../../interaction/collection-interaction.ts';
import {
  clipTextCells,
  createTerminalTextIndex,
  measureTextCells,
  normalizeTextSelection,
  oneCellGlyph,
  padTextCells,
  sanitizeTerminalText,
  segmentGraphemes,
  terminalTextWidth,
} from '../../text/index.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { CalendarTransition, CalendarDay } from '../../behavior/calendar.ts';
import { decodeCalendarDate } from '../../behavior/calendar.ts';
import type { ChoiceItem } from '../../collection/item.ts';
import type {
  CheckboxGroupTransition,
  ColorSwatchPickerTransition,
  RadioGroupTransition,
} from '../../behavior/choice-controls.ts';
import type { SliderTransition } from '../form-controls.ts';
import type {
  NumberInputControlTransition,
  NumberInputView,
} from '../../behavior/number-input.ts';
import type { RangeSliderTransition, RangeSliderHandle } from '../../behavior/range-slider.ts';
import type {
  CalendarStylePart,
  ChoiceStylePart,
  ColorSwatchPickerStylePart,
  NumberInputStylePart,
  SliderStylePart,
  TextEntryStylePart,
} from '../style-parts.ts';
import type { TextInputSubmitEvent, TextInputTransition, TextInputState } from '../../behavior/text-input.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
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
import {
  inspectTextSelection,
  inspectTextValue,
  inspectValidation,
} from '../internal/inspection.ts';

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
type CheckboxGroupComponentOptions = Omit<
  CheckboxGroupOptions<unknown, ComponentMessage>,
  'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'
>;
type RadioGroupComponentOptions = Omit<
  RadioGroupOptions<unknown, ComponentMessage>,
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

interface ChoiceModel {
  readonly label: string;
  readonly options: readonly ChoiceModelItem[];
  readonly interaction: CollectionInteractionState;
  readonly required: boolean;
  readonly error: string;
}

interface ChoiceModelItem {
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
  CheckboxGroupTransition,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'active', 'selected', 'disabled']
>({
  ...choiceDefinitionBase('checkbox-group'),
  accessibleRole: 'group',
  createModel: (value) => createChoiceModel(value, 'checkboxGroup', true),
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
  assertTransitionCallback(options, 'checkboxGroup');
  const { onTransition, ...rest } = options;
  return instantiateCheckboxGroup({
    ...rest,
    onAction: (action) => {
      if (
        action.kind === 'setActive'
        || action.kind === 'commitActive'
        || action.kind === 'clearSelection'
      ) return ignoreMessage();
      return onTransition(action);
    },
  });
};

type RadioGroupFactory = <TValue, const TMessage extends ComponentMessage = never>(
  options: RadioGroupOptions<TValue, TMessage>,
) => Element<TMessage>;

const instantiateRadioGroup = defineComponent<
  RadioGroupComponentOptions,
  ChoiceModel,
  RadioGroupTransition,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'active', 'selected', 'disabled']
>({
  ...choiceDefinitionBase('radio-group'),
  accessibleRole: 'radiogroup',
  createModel: (value) => createChoiceModel(value, 'radioGroup', false),
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
  assertTransitionCallback(options, 'radioGroup');
  const { onTransition, ...rest } = options;
  return instantiateRadioGroup({
    ...rest,
    onAction: (action) => {
      if (action.kind === 'setActive' || action.kind === 'clearSelection') {
        return ignoreMessage();
      }
      return onTransition(action);
    },
  });
};

interface SwatchModel {
  readonly label: string;
  readonly options: readonly SwatchModelItem[];
  readonly interaction: CollectionInteractionState;
  readonly columns: number;
  readonly error: string;
}

interface SwatchModelItem extends ChoiceModelItem {
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
  Omit<ColorSwatchPickerOptions<unknown, ComponentMessage>, 'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'>,
  SwatchModel,
  ColorSwatchPickerTransition,
  ColorSwatchPickerStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'active', 'selected', 'disabled']
>({
  name: 'terminal-ui/components/color-swatch-picker',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'listbox',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'summary', 'option', 'swatch', 'error'],
  visualStates: ['focused', 'active', 'selected', 'disabled'],
  createModel: createSwatchModel,
  measure: (input) => measureLines(swatchLines(input, false), input),
  render: (input) => {
    paintLines(input, swatchLines(input, true));
  },
  keys: ({ model }) => pickerKeys(model),
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
      ...(model.label === '' ? {} : { label: model.label }),
      ...(selected === undefined ? {} : { value: selected.label }),
      invalid: model.error !== '',
      ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
      ...(focused ? { focused: true } : {}),
      ...(model.interaction.activeId === undefined
        ? {}
        : { activeDescendant: `${id}:${model.interaction.activeId}` }),
      children: [...model.options.map((option) => ({
        id: `${id}:${option.id}`,
        role: 'option' as const,
        label: option.label,
        selected: isChoiceSelected(model.interaction.selection, option.id),
        ...(option.id === model.interaction.activeId ? { current: true } : {}),
        ...(disabled || option.disabled ? { disabled: true } : {}),
      })), ...(model.error === '' ? [] : [{ id: `${id}:error`, role: 'group' as const, label: model.error }])],
    };
  },
});

export const colorSwatchPicker: ColorSwatchPickerFactory = (options) => {
  if (options.disabled === true) {
    return instantiateColorSwatchPicker(options);
  }
  assertTransitionCallback(options, 'colorSwatchPicker');
  const { onTransition, ...rest } = options;
  return instantiateColorSwatchPicker({
    ...rest,
    onAction: (action) => {
      if (action.kind === 'setActive' || action.kind === 'clearSelection') {
        return ignoreMessage();
      }
      return onTransition(action);
    },
  });
};

interface CalendarModel {
  readonly label: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDayModel[];
  readonly interaction: CollectionInteractionState;
  readonly error: string;
}

interface CalendarDayModel extends CalendarDay {
  readonly disabled: boolean;
  readonly hidden: boolean;
}

type CalendarFactory = <const TMessage extends ComponentMessage = never>(
  options: CalendarOptions<TMessage>,
) => Element<TMessage>;

const instantiateCalendar = defineComponent<
  Omit<CalendarOptions<ComponentMessage>, 'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'>,
  CalendarModel,
  CalendarTransition,
  CalendarStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'selected', 'disabled']
>({
  name: 'terminal-ui/components/calendar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'grid',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'option', 'month', 'weekday', 'error'],
  visualStates: ['focused', 'selected', 'disabled'],
  createModel: createCalendarModel,
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
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: calendarHitTargets,
  accessibility({ id, model, focused, disabled }) {
    const days = model.days.filter((day) => !day.hidden);
    const rowCount = Math.ceil(days.length / 7);
    return {
      id,
      role: 'grid',
      label: model.label || model.monthLabel,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : { errorMessage: `${id}:error` }),
      ...(focused ? { focused: true } : {}),
      ...(model.interaction.activeId === undefined
        ? {}
        : { activeDescendant: `${id}:${model.interaction.activeId}` }),
      ...(rowCount === 0 ? {} : { position: { rowCount, columnCount: 7 } }),
      children: [...Array.from({ length: rowCount }, (_, rowIndex) => ({
        id: `${id}:week:${String(rowIndex + 1)}`,
        role: 'row' as const,
        position: { rowIndex: rowIndex + 1, rowCount, columnCount: 7 },
        children: days.slice(rowIndex * 7, (rowIndex + 1) * 7).map((day, columnIndex) => ({
          id: `${id}:${day.id}`,
          role: 'gridcell' as const,
          label: day.label,
          selected: isChoiceSelected(model.interaction.selection, day.id),
          ...(day.id === model.interaction.activeId ? { current: true } : {}),
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
  assertTransitionCallback(options, 'calendar');
  const { onTransition, ...rest } = options;
  return instantiateCalendar({
    ...rest,
    onAction: (action) => {
      if (action.kind === 'setActive') return ignoreMessage();
      return onTransition(action);
    },
  });
};

interface TextEntryModel {
  readonly state: TextInputState;
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
  assertTransitionCallback(options, 'textInput');
  const { onTransition, onSubmit, onContextMenu, ...rest } = options;
  return textInputDefinition({
    ...rest,
    onAction: (action) => {
      if (action.kind === 'contextMenu') return onContextMenu?.(action.event) ?? ignoreMessage();
      if (action.kind === 'submit') return onSubmit?.(action) ?? ignoreMessage();
      return onTransition(action);
    },
  });
}

export function passwordInput<const TMessage extends ComponentMessage = never>(
  options: PasswordInputOptions<TMessage>,
): Element<TMessage> {
  if (options.disabled === true) {
    return passwordInputDefinition(options);
  }
  assertTransitionCallback(options, 'passwordInput');
  const { onTransition, onSubmit, onContextMenu, ...rest } = options;
  return passwordInputDefinition({
    ...rest,
    onAction: (action) => {
      if (action.kind === 'contextMenu') return onContextMenu?.(action.event) ?? ignoreMessage();
      if (action.kind === 'submit') return onSubmit?.(action) ?? ignoreMessage();
      return onTransition(action);
    },
  });
}

interface NumberModel {
  readonly state: NumberInputView;
  readonly placeholder: string;
  readonly required: boolean;
  readonly error: string;
}

type NumberInputFactory = <const TMessage extends ComponentMessage = never>(
  options: NumberInputOptions<TMessage>,
) => Element<TMessage>;

const instantiateNumberInput = defineComponent<
  Omit<NumberInputOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'>,
  NumberModel,
  NumberInputComponentAction,
  NumberInputStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'selected', 'disabled', 'readOnly']
>({
  name: 'terminal-ui/components/number-input',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'spinbutton',
  states: ['disabled', 'readOnly'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['border', 'value', 'placeholder', 'selection', 'cursor', 'stepper', 'error'],
  visualStates: ['focused', 'selected', 'disabled', 'readOnly'],
  inspection: ({ model }) => ({
    value: inspectTextValue(model.state.value),
    ...(model.state.selection === undefined
      ? {}
      : { selection: inspectTextSelection(model.state.selection) }),
    details: { caretOffset: model.state.cursor },
    validation: inspectValidation(model.required, model.error),
  }),
  createModel: createNumberInputModel,
  measure: measureNumberInput,
  render: paintNumberInput,
  keys: ({ readOnly }) => ({
    triggers: textEditingTriggers(readOnly, false),
    ...(readOnly ? {} : {
      arrowUp: () => ({ kind: 'step' as const, direction: 'increment' as const }),
      arrowDown: () => ({ kind: 'step' as const, direction: 'decrement' as const }),
      enter: () => ({ kind: 'commit' as const }),
    }),
  }),
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  focusTargets: (input) => {
    const bounds = numberInputGeometry(input.bounds, input.disabled || input.readOnly)?.input ?? input.bounds;
    const visual = numberInputVisual(input.model, bounds.width, input.widthProfile);
    const cursorStyle = input.style({
      part: 'cursor',
      states: ['focused'],
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
            2 + visual.cursorColumn,
          ),
        ),
        ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
        source: input.frameSource({
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
      `Numeric input is ${model.state.validity}.`,
      model.state.committedValue === undefined
        ? ''
        : `Committed value: ${String(model.state.committedValue)}.`,
    ].filter(Boolean).join(' ');
    return {
      id,
      role: 'spinbutton',
      value: model.state.value,
      textPosition: {
        caretOffset: model.state.cursor,
        ...(model.state.selection === undefined
          ? {}
          : { selection: model.state.selection }),
      },
      required: model.required,
      invalid: model.error !== '' || model.state.validity === 'invalid' || model.state.validity === 'outOfRange',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(model.state.validity === 'valid' || model.state.validity === 'outOfRange'
        ? {
          numericValue: {
            current: model.state.parsedValue,
            ...(model.state.min === undefined ? {} : { minimum: model.state.min }),
            ...(model.state.max === undefined ? {} : { maximum: model.state.max }),
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
  assertTransitionCallback(options, 'numberInput');
  const { onTransition, onContextMenu, ...rest } = options;
  return instantiateNumberInput({
    ...rest,
    onAction: (action) => action.kind === 'contextMenu'
      ? onContextMenu?.(action.event) ?? ignoreMessage()
      : onTransition(action),
  });
};

function assertTransitionCallback(
  options: { readonly onTransition?: unknown },
  component: string,
): void {
  assertRequiredCallback(options.onTransition, `${component} onTransition`);
}

interface ChoiceDefinitionBase<TName extends 'checkbox-group' | 'radio-group'> {
  readonly name: `terminal-ui/components/${TName}`;
  readonly identity: 'required';
  readonly structure: 'leaf';
  readonly semantics: 'semantic';
  readonly states: readonly ['disabled'];
  readonly metadata: readonly ['focus', 'layer', 'styles'];
  readonly parts: readonly ['label', 'marker', 'option', 'description', 'error'];
  readonly visualStates: readonly ['focused', 'active', 'selected', 'disabled'];
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
    visualStates: ['focused', 'active', 'selected', 'disabled'] as const,
    focusTargets: ({ bounds }: ComponentInput<ChoiceModel>) => [{ id: 'self', bounds }],
  };
}

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

function createChoiceModel(
  value: Readonly<CheckboxGroupComponentOptions | RadioGroupComponentOptions>,
  owner: string,
  multiple: boolean,
): ChoiceModel {
  const options = value.options.map((item, index) =>
    decodeChoiceItem(item, `${owner} options[${String(index)}]`)
  );
  assertUnique(options, owner);
  const interaction = decodeChoiceState(
    value.state,
    multiple ? 'multiple' : 'single',
    owner,
    options.map((option) => option.id),
  );
  return {
    label: cleanString(value.label, `${owner} label`),
    options,
    interaction,
    required: optionalBoolean(value.required, `${owner} required`) ?? false,
    error: optionalString(value.error, `${owner} error`) ?? '',
  };
}

function decodeChoiceState(
  value: unknown,
  expectedMode: 'single' | 'multiple',
  owner: string,
  itemIds: readonly string[],
): CollectionInteractionState {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${owner} state must contain collection interaction state.`);
  }
  const activeId = optionalString(value['activeId'], `${owner} activeId`);
  const selection = decodeSelectionState(value['selection'], `${owner} selection`);
  if (selection.mode !== expectedMode) {
    throw new TypeError(`${owner} selection mode must be ${expectedMode}.`);
  }
  const referencedIds = [
    ...(activeId === undefined ? [] : [activeId]),
    ...choiceSelectedIds(selection),
    ...(selection.mode === 'multiple' && selection.anchorId !== undefined
      ? [selection.anchorId]
      : []),
  ];
  if (referencedIds.some((id) => !itemIds.includes(id))) {
    throw new RangeError(`${owner} interaction must reference an existing item.`);
  }
  return {
    ...(activeId === undefined ? {} : { activeId }),
    selection: selection,
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

function decodeChoiceItem(
  value: ChoiceItem<unknown>,
  owner: string,
): ChoiceModelItem {
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
    const pointer = pointerVisualState(input.pointerState, `${input.id ?? kind}:${option.id}`);
    const states = input.disabled || option.disabled
      ? ['disabled' as const]
      : [
        ...(selected.has(option.id) ? ['selected' as const] : []),
        ...(option.id === input.model.interaction.activeId ? ['active' as const] : []),
        ...(pointer === undefined ? [] : [pointer]),
      ];
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
            states,
          ),
          choiceSpan(
            input,
            ' ',
            'option',
            `option.${option.id}.gap`,
            decorated,
            states,
            'separator',
          ),
          choiceSpan(input, option.label, 'option', `option.${option.id}.label`, decorated, states),
        ],
        decorated,
        states,
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
            states,
            'decoration',
          ),
          choiceSpan(
            input,
            option.description,
            'description',
            `option.${option.id}.description`,
            decorated,
            states,
          ),
        ],
        decorated,
        states,
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
  option: ChoiceModelItem,
  spans: readonly RenderSpan[],
  decorated: boolean,
  states: readonly ('disabled' | 'hovered' | 'pressed' | 'active' | 'selected')[],
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
      states,
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
  states: readonly ('disabled' | 'hovered' | 'pressed' | 'active' | 'selected')[],
  cellRole: import('../../visual/frame-source.ts').FrameCellRole = part === 'marker'
    ? 'decoration'
    : 'text',
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const state = states.at(-1);
  const style = input.style({ part, ...(states.length === 0 ? {} : { states }) });
  const itemId = description.split('.')[1];
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      partName: part,
      partType: part,
      description,
      cellRole,
      ...(itemId === undefined ? {} : { itemId }),
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  });
}

function checkboxChoiceKeys(model: ChoiceModel): ElementKeyBindings<CheckboxGroupTransition> {
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

function radioChoiceKeys(model: ChoiceModel): ElementKeyBindings<RadioGroupTransition> {
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

function activeChoice(model: ChoiceModel): ChoiceModelItem | undefined {
  return model.options.find((option) => option.id === model.interaction.activeId && !option.disabled) ??
    model.options.find((option) => !option.disabled);
}

function checkboxChoiceHitTargets(
  input: ComponentInput<ChoiceModel>,
): readonly HitTarget<CheckboxGroupTransition>[] {
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
): readonly HitTarget<RadioGroupTransition>[] {
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
    ...(input.model.label === '' ? {} : { label: input.model.label }),
    ...(input.model.error === '' ? {} : { description: input.model.error }),
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.interaction.activeId === undefined
      ? {}
      : { activeDescendant: `${input.id}:option:${input.model.interaction.activeId}` }),
    children: input.model.options.map((option) => ({
      id: `${input.id}:option:${option.id}`,
      role: kind,
      label: option.label,
      checked: selected.has(option.id),
      ...(option.id === input.model.interaction.activeId ? { current: true } : {}),
      ...(option.description === undefined ? {} : { description: option.description }),
      ...(input.disabled || option.disabled ? { disabled: true } : {}),
    })),
  };
}

function createSwatchModel(
  value: Readonly<Omit<ColorSwatchPickerOptions<unknown, ComponentMessage>, 'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'>>,
): SwatchModel {
  const options = value.options.map((item, index): SwatchModelItem => {
    const base = decodeChoiceItem(item, `colorSwatchPicker options[${String(index)}]`);
    const swatch = optionalString(item.swatch, 'colorSwatchPicker swatch') ?? '■';
    if (terminalTextWidth(swatch) !== 1) {
      throw new RangeError('colorSwatchPicker swatch must occupy one terminal cell.');
    }
    return {
      ...base,
      swatch,
      ...(item.style === undefined ? {} : {
        swatchStyle: decodeTerminalStyle(
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
  const interaction = decodeChoiceState(
    value.state,
    'single',
    'colorSwatchPicker',
    options.map((option) => option.id),
  );
  return {
    label: cleanString(value.label, 'colorSwatchPicker label'),
    options,
    interaction,
    columns,
    error: optionalString(value.error, 'colorSwatchPicker error') ?? '',
  };
}

function swatchLines(
  input: ComponentMeasureInput<SwatchModel> | ComponentRenderInput<SwatchModel, ColorSwatchPickerStylePart>,
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

function pickerKeys(model: SwatchModel): ElementKeyBindings<ColorSwatchPickerTransition> {
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

function selectedSwatch(model: SwatchModel): SwatchModelItem | undefined {
  const selectedId = singleSelectedId(model.interaction.selection);
  return selectedId === undefined
    ? undefined
    : model.options.find((option) => option.id === selectedId);
}

function swatchStyle(option: SwatchModelItem): TerminalStyle {
  return option.swatchStyle ?? {
    fg: { kind: 'theme', token: 'control.primary.foreground' },
    bg: { kind: 'theme', token: 'control.primary.background' },
  };
}

function swatchOptionSpans(
  input: ComponentMeasureInput<SwatchModel> | ComponentRenderInput<SwatchModel, ColorSwatchPickerStylePart>,
  option: SwatchModelItem,
  decorated: boolean,
): readonly RenderSpan[] {
  const selected = isChoiceSelected(input.model.interaction.selection, option.id);
  const states = input.disabled || option.disabled
    ? ['disabled' as const]
    : [
      ...(selected ? ['selected' as const] : []),
      ...(option.id === input.model.interaction.activeId ? ['active' as const] : []),
    ];
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
      states,
    ),
    controlSpan(
      input,
      oneCellGlyph(option.swatch, '*', { widthProfile: input.widthProfile }),
      'swatch',
      `option.${option.id}.swatch`,
      decorated,
      swatchStyle(option),
      'decoration',
      states,
    ),
    controlSpan(
      input,
      ' ',
      'option',
      `option.${option.id}.separator`,
      decorated,
      undefined,
      'separator',
      states,
    ),
    controlSpan(
      input,
      label,
      'option',
      `option.${option.id}.label`,
      decorated,
      option.swatchStyle,
      'text',
      states,
    ),
    controlSpan(
      input,
      selected ? ']' : ' ',
      'option',
      `option.${option.id}.close`,
      decorated,
      undefined,
      'decoration',
      states,
    ),
  ];
}

function createCalendarModel(
  value: Readonly<Omit<CalendarOptions<ComponentMessage>, 'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'>>,
): CalendarModel {
  if (!isNonArrayObject(value.view)
    || !Array.isArray(value.view.weekdays)
    || !Array.isArray(value.view.days)) {
    throw new TypeError('calendar options are invalid.');
  }
  if (value.view.weekdays.length !== 7) {
    throw new RangeError('calendar weekdays must contain seven labels.');
  }
  const weekdays = value.view.weekdays.map((day, index) =>
    cleanString(day, `calendar weekdays[${String(index)}]`)
  );
  const days = value.view.days.map((day, index): CalendarDayModel => {
    if (!isNonArrayObject(day) || !isNonArrayObject(day['date'])) {
      throw new TypeError(`calendar days[${String(index)}] is invalid.`);
    }
    const date = decodeCalendarDate(day['date'], `calendar days[${String(index)}] date`);
    return {
      id: cleanString(day['id'], 'calendar day id'),
      label: cleanString(day['label'], 'calendar day label'),
      date,
      disabled: optionalBoolean(day['disabled'], 'calendar day disabled') ?? false,
      hidden: optionalBoolean(day['hidden'], 'calendar day hidden') ?? false,
      ...(day['today'] === true ? { today: true } : {}),
      ...(day['outsideMonth'] === true ? { outsideMonth: true } : {}),
    };
  });
  assertUnique(days, 'calendar');
  const interaction = decodeChoiceState(
    value.view.interaction,
    'single',
    'calendar',
    days.map((day) => day.id),
  );
  return {
    label: cleanString(value.label, 'calendar label'),
    monthLabel: cleanString(value.view.monthLabel, 'calendar monthLabel'),
    weekdays,
    days,
    interaction,
    error: optionalString(value.error, 'calendar error') ?? '',
  };
}

function calendarLines(
  input:
    | ComponentMeasureInput<CalendarModel>
    | ComponentRenderInput<CalendarModel, CalendarStylePart>,
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
    | ComponentRenderInput<CalendarModel, CalendarStylePart>,
  day: CalendarDayModel,
  decorated: boolean,
): readonly RenderSpan[] {
  const selected = isChoiceSelected(input.model.interaction.selection, day.id);
  const states = input.disabled || day.disabled || day.outsideMonth === true
    ? ['disabled' as const]
    : [
      ...(selected ? ['selected' as const] : []),
      ...(day.id === input.model.interaction.activeId ? ['focused' as const] : []),
    ];
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
      states,
    ),
    controlSpan(input, label, 'option', `day.${day.id}.label`, decorated, undefined, 'text', states),
    controlSpan(
      input,
      close,
      'option',
      `day.${day.id}.${selected ? 'close' : 'trailing'}`,
      decorated,
      undefined,
      'decoration',
      states,
    ),
  ];
}

function activeDay(model: CalendarModel): CalendarDayModel | undefined {
  return model.days.find((day) =>
    day.id === model.interaction.activeId && !day.disabled && !day.hidden
  );
}

function calendarHitTargets(
  input: ComponentInput<CalendarModel>,
): readonly HitTarget<CalendarTransition>[] {
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
  TextEntryComponentAction,
  TextEntryStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'selected', 'disabled', 'readOnly']
>;

type TextInputComponentOptions = Omit<
  TextInputOptions<ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'
>;
type PasswordInputComponentOptions = Omit<
  PasswordInputOptions<ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'
>;

type TextEntryComponentAction = TextInputTransition | TextInputSubmitEvent | {
  readonly kind: 'contextMenu';
  readonly event: TextContextMenuEvent;
};

type NumberInputComponentAction = NumberInputControlTransition | {
  readonly kind: 'contextMenu';
  readonly event: TextContextMenuEvent;
};

function textEntryDefinition<
  TOptions extends TextInputComponentOptions | PasswordInputComponentOptions,
>(
  name: 'text-input' | 'password-input',
  password: boolean,
): TextEntryFactory<TOptions> {
  return defineComponent<
    TOptions,
    TextEntryModel,
    TextEntryComponentAction,
    TextEntryStylePart,
    readonly ['disabled', 'readOnly'],
    'required',
    readonly ['focus', 'layer', 'styles'],
    readonly ['focused', 'selected', 'disabled', 'readOnly']
  >({
    name: `terminal-ui/components/${name}`,
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'textbox',
    states: ['disabled', 'readOnly'],
    metadata: ['focus', 'layer', 'styles'],
    parts: ['border', 'label', 'value', 'placeholder', 'selection', 'cursor', 'error'],
    visualStates: ['focused', 'selected', 'disabled', 'readOnly'],
    sensitiveInput: password,
    inspection: ({ model }) => ({
      ...(password ? { redacted: true as const } : {
        value: inspectTextValue(model.sourceValue),
        ...(model.state.selection === undefined
          ? {}
          : { selection: inspectTextSelection(model.state.selection) }),
        details: { caretOffset: model.state.cursor },
      }),
      validation: inspectValidation(model.required, model.error),
    }),
    createModel: (value) => createTextEntryModel(
      value,
      name,
      password,
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
        enter: () => ({ kind: 'submit', value: model.sourceValue }),
      }),
    }),
    onInput: ({ text, readOnly }) =>
      readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
    onPaste: ({ text, readOnly }) =>
      readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
    focusTargets: (input) => {
      const visual = textEntryVisual(input.model, input.bounds.width, input.widthProfile);
      const cursorStyle = input.style({
        part: 'cursor',
        states: ['focused'],
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
              2 + visual.cursorColumn,
            ),
          ),
          ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
          source: input.frameSource({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
        },
      }];
    },
    hitTargets(input) {
      const bounds = { ...input.bounds, height: Math.min(1, input.bounds.height) };
      if (bounds.width === 0 || bounds.height === 0) return [];
      const visual = textEntryVisual(input.model, bounds.width, input.widthProfile);
      const offsetAt = (event: RoutedPointerEvent): number =>
        sourceOffsetAtColumn(
          input.model,
          visual.offsetCells + Math.max(
            0,
            (event.localColumn ?? event.column + 1)
              - 3
              - Number(visual.clippedBefore),
          ),
          input.widthProfile,
        );
      return [textPointerTarget<TextEntryComponentAction>({
        id: `${input.id ?? name}:text`,
        bounds,
        ...(input.model.state.selection === undefined
          ? {}
          : { selection: input.model.state.selection }),
        focusTargetId: 'self',
        offsetAt(event, origin) {
          if (origin === 'current') return offsetAt(event);
          return sourceOffsetAtColumn(
            input.model,
            visual.offsetCells + Math.max(
              0,
              (event.pressLocalColumn ?? event.localColumn ?? event.column + 1)
                - 3
                - Number(visual.clippedBefore),
            ),
            input.widthProfile,
          );
        },
        wordSelectionAt: (offset) => createTerminalTextIndex(input.model.sourceValue, {
          widthProfile: input.widthProfile,
        }).wordSelectionAt(offset),
        onPointer: (transition) => ({ kind: 'pointer', transition }),
        onContextMenu: (event) => ({ kind: 'contextMenu', event }),
      })];
    },
    accessibility: ({ id, model, focused }) => ({
      id,
      role: 'textbox',
      required: model.required,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(password ? {} : {
        value: model.sourceValue,
        textPosition: {
          caretOffset: model.state.cursor,
          ...(model.state.selection === undefined
            ? {}
            : { selection: model.state.selection }),
        },
      }),
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

function createTextEntryModel(
  value: Readonly<TextInputComponentOptions | PasswordInputComponentOptions>,
  owner: string,
  password: boolean,
): TextEntryModel {
  if (!isNonArrayObject(value.state)) {
    throw new TypeError(`${owner} state must be an object.`);
  }
  const state = decodeTextInputState(value.state, owner);
  const mask = password
    ? optionalString('mask' in value ? value.mask : undefined, `${owner} mask`) ?? '•'
    : undefined;
  if (
    mask !== undefined && (segmentGraphemes(mask).length !== 1 || terminalTextWidth(mask) !== 1)
  ) throw new RangeError('passwordInput mask must be one printable one-cell grapheme.');
  const graphemes = segmentGraphemes(state.value);
  const displayedValue = mask === undefined ? state.value : mask.repeat(graphemes.length);
  const displayedCursor = mask === undefined
    ? state.cursor
    : graphemes.filter((part) => part.endOffsetExclusive <= state.cursor).length *
      mask.length;
  const selection = state.selection;
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
  return {
    state: { ...state, cursor: displayedCursor },
    displayedValue,
    placeholder: optionalString(value.placeholder, `${owner} placeholder`) ?? '',
    required: optionalBoolean(value.required, `${owner} required`) ?? false,
    error: optionalString(value.error, `${owner} error`) ?? '',
    sourceValue: state.value,
    ...(displayedSelection === undefined ? {} : { displayedSelection }),
    ...(mask === undefined ? {} : { maskCodeUnits: mask.length }),
  };
}

function decodeTextInputState(
  value: TextInputState,
  owner: string,
): TextInputState {
  const raw = cleanString(value.value, `${owner} value`);
  const cursor = nonNegativeInteger(value.cursor, `${owner} cursor`);
  if (cursor > raw.length) throw new RangeError(`${owner} cursor exceeds value length.`);
  const selection = decodeTextSelection(value.selection, raw, owner);
  return { value: raw, cursor, ...(selection === undefined ? {} : { selection }) };
}

function decodeTextSelection(
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
      ? { states: ['disabled'] as const }
      : input.focus === 'self'
      ? { states: ['focused'] as const }
      : {}),
  });
  const usesPlaceholder = input.model.displayedValue === '' && input.model.placeholder !== '';
  const shown = usesPlaceholder ? input.model.placeholder : input.model.displayedValue;
  const visual = textEntryVisual(input.model, input.bounds.width, input.widthProfile);
  const valueStyle = input.style({
    part: usesPlaceholder ? 'placeholder' : 'value',
    base: {
      fg: { kind: 'theme', token: usesPlaceholder ? 'input.placeholder' : 'control.foreground' },
      bg: { kind: 'theme', token: 'control.background' },
      ...(usesPlaceholder ? { dim: true } : {}),
    },
    ...(input.disabled ? { states: ['disabled'] as const } : {}),
  });
  const selectionStyle = input.style({
    part: 'selection',
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
    states: ['selected'],
  });
  const spans: RenderSpan[] = [span(`${marker} `, {
    ...(borderStyle === undefined ? {} : { style: borderStyle }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'border',
      partType: 'frame',
      description: 'frame.prefix',
    }),
  })];
  if (usesPlaceholder) {
    spans.push(span(shown, {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'placeholder',
        partType: 'placeholder',
        description: 'placeholder',
      }),
    }));
  } else {
    if (visual.clippedBefore) {
      spans.push(span('‹', {
        ...(borderStyle === undefined ? {} : { style: borderStyle }),
        source: input.frameSource({
          cellRole: 'decoration',
          partName: 'border',
          partType: 'frame',
          description: 'value.window',
        }),
      }));
    }
    const selection = input.model.displayedSelection;
    const records = [
      {
        start: visual.startOffset,
        end: selection?.startOffset ?? visual.endOffsetExclusive,
        selected: false,
      },
      ...(selection === undefined ? [] : [{
        start: selection.startOffset,
        end: selection.endOffsetExclusive,
        selected: true,
      }]),
      {
        start: selection?.endOffsetExclusive ?? visual.endOffsetExclusive,
        end: visual.endOffsetExclusive,
        selected: false,
      },
    ];
    for (const record of records) {
      const start = Math.max(visual.startOffset, record.start);
      const end = Math.min(visual.endOffsetExclusive, record.end);
      const current = shown.slice(start, end);
      if (current === '') continue;
      spans.push(span(current, {
        ...(record.selected
          ? selectionStyle === undefined ? {} : { style: selectionStyle }
          : valueStyle === undefined
          ? {}
          : { style: valueStyle }),
        source: input.frameSource({
          cellRole: 'text',
          partName: record.selected ? 'selection' : 'value',
          partType: record.selected ? 'selection' : 'value',
          description: record.selected ? 'selection' : 'value',
        }),
      }));
    }
  }
  const occupied = 2 + Number(!usesPlaceholder && visual.clippedBefore) + measureTextCells(
    usesPlaceholder ? shown : visual.visibleText,
    { widthProfile: input.widthProfile },
  ).cells;
  const padding = Math.max(0, input.bounds.width - occupied);
  if (padding > 0) {
    spans.push(span(' '.repeat(padding), {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.frameSource({
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
      source: input.frameSource({
        cellRole: 'text',
        partName: 'error',
        partType: 'error',
        description: 'validation.error',
      }),
    })]);
  }
}

function textEntryVisual(
  model: TextEntryModel,
  width: number,
  widthProfile: TextWidthProfile,
): SingleLineTextWindow {
  return layoutSingleLineTextWindow(
    model.displayedValue,
    model.state.cursor,
    Math.max(0, width - 2),
    widthProfile,
  );
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

function createNumberInputModel(
  value: Readonly<Omit<NumberInputOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onTransition' | 'styles' | 'meta'>>,
): NumberModel {
  if (!isNonArrayObject(value.view)) {
    throw new TypeError('numberInput state must be an object.');
  }
  const raw = value.view;
  const text = cleanString(raw.value, 'numberInput value');
  const cursor = nonNegativeInteger(raw.cursor, 'numberInput cursor');
  if (cursor > text.length) throw new RangeError('numberInput cursor exceeds value length.');
  const selection = decodeTextSelection(raw.selection, text, 'numberInput');
  const validity = raw.validity;
  if (!isStringMember(validity, ['empty', 'incomplete', 'invalid', 'valid', 'outOfRange'])) {
    throw new TypeError('numberInput validity is invalid.');
  }
  const parsedValue = 'parsedValue' in raw ? raw.parsedValue : undefined;
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
  let state: NumberInputView;
  if (validity === 'valid' || validity === 'outOfRange') {
    if (typeof parsedValue !== 'number' || !Number.isFinite(parsedValue)) {
      throw new TypeError('numberInput parsedValue must be finite for a numeric validity.');
    }
    state = { ...common, validity, parsedValue };
  } else {
    state = { ...common, validity };
  }
  return {
    state,
    placeholder: optionalString(value.placeholder, 'numberInput placeholder') ?? '',
    required: optionalBoolean(value.required, 'numberInput required') ?? false,
    error: optionalString(value.error, 'numberInput error') ?? '',
  };
}

const numberStepperWidth = 8;

function measureNumberInput(input: ComponentMeasureInput<NumberModel>): Measurement {
  const shown = input.model.state.value === ''
    ? input.model.placeholder
    : input.model.state.value;
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
  const usesPlaceholder = input.model.state.value === '' && input.model.placeholder !== '';
  const shown = usesPlaceholder ? input.model.placeholder : input.model.state.value;
  const visual = numberInputVisual(input.model, inputBounds.width, input.widthProfile);
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
      ? { states: ['disabled'] as const }
      : input.focus === 'self'
      ? { states: ['focused'] as const }
      : {}),
  });
  const valueStyle = input.style({
    part: usesPlaceholder ? 'placeholder' : 'value',
    base: {
      fg: { kind: 'theme', token: usesPlaceholder ? 'input.placeholder' : 'control.foreground' },
      bg: { kind: 'theme', token: 'control.background' },
      ...(usesPlaceholder ? { dim: true } : {}),
    },
    ...(input.disabled ? { states: ['disabled'] as const } : {}),
  });
  const selectionStyle = input.style({
    part: 'selection',
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
    states: ['selected'],
  });
  const contentSpans: RenderSpan[] = [];
  const selection = usesPlaceholder ? undefined : input.model.state.selection;
  if (usesPlaceholder) {
    contentSpans.push(span(shown, {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'placeholder',
        partType: 'placeholder',
        description: 'placeholder',
      }),
    }));
  } else {
    if (visual.clippedBefore) {
      contentSpans.push(span('‹', {
        ...(borderStyle === undefined ? {} : { style: borderStyle }),
        source: input.frameSource({
          cellRole: 'decoration',
          partName: 'border',
          partType: 'frame',
          description: 'value.window',
        }),
      }));
    }
    for (const range of [
      {
        start: visual.startOffset,
        end: selection?.startOffset ?? visual.endOffsetExclusive,
        selected: false,
      },
      ...(selection === undefined ? [] : [{
        start: selection.startOffset,
        end: selection.endOffsetExclusive,
        selected: true,
      }]),
      {
        start: selection?.endOffsetExclusive ?? visual.endOffsetExclusive,
        end: visual.endOffsetExclusive,
        selected: false,
      },
    ]) {
      const start = Math.max(visual.startOffset, range.start);
      const end = Math.min(visual.endOffsetExclusive, range.end);
      const text = shown.slice(start, end);
      if (text === '') continue;
      contentSpans.push(span(text, {
        ...(range.selected
          ? selectionStyle === undefined ? {} : { style: selectionStyle }
          : valueStyle === undefined ? {} : { style: valueStyle }),
        source: input.frameSource({
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
        source: input.frameSource({
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
      source: input.frameSource({
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
        source: input.frameSource({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'separator',
          description: 'step.separator.before',
        }),
      }),
      span('−', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.frameSource({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'decrement',
          description: 'step.decrement',
        }),
      }),
      span('  ', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.frameSource({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'separator',
          description: 'step.separator.between',
        }),
      }),
      span('+', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.frameSource({
          cellRole: 'decoration',
          partName: 'stepper',
          partType: 'increment',
          description: 'step.increment',
        }),
      }),
      span(' ', {
        ...(stepperStyle === undefined ? {} : { style: stepperStyle }),
        source: input.frameSource({
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
          source: input.frameSource({
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
): readonly HitTarget<NumberInputComponentAction>[] {
  const geometry = numberInputGeometry(input.bounds, input.disabled || input.readOnly);
  const inputBounds = geometry?.input ?? input.bounds;
  const index = createTerminalTextIndex(input.model.state.value, {
    widthProfile: input.widthProfile,
  });
  const visual = numberInputVisual(input.model, inputBounds.width, input.widthProfile);
  const focusTarget = textPointerTarget<NumberInputComponentAction>({
    id: `${input.id ?? 'number-input'}:input`,
    bounds: inputBounds,
    ...(input.model.state.selection === undefined
      ? {}
      : { selection: input.model.state.selection }),
    focusTargetId: 'self',
    offsetAt(event, origin) {
      const localColumn = origin === 'press'
        ? event.pressLocalColumn ?? event.localColumn ?? event.column + 1
        : event.localColumn ?? event.column + 1;
      const column = visual.offsetCells + Math.max(
        0,
        localColumn - 3 - Number(visual.clippedBefore),
      );
      return index.graphemeIndexToCodeUnitOffset(index.visualColumnToGraphemeIndex(column));
    },
    wordSelectionAt: (offset) => index.wordSelectionAt(offset),
    onPointer: (transition) => ({ kind: 'pointer', transition }),
    onContextMenu: (event) => ({ kind: 'contextMenu', event }),
  });
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

function numberInputVisual(
  model: NumberModel,
  width: number,
  widthProfile: TextWidthProfile,
): SingleLineTextWindow {
  return layoutSingleLineTextWindow(
    model.state.value,
    model.state.cursor,
    Math.max(0, width - 2),
    widthProfile,
  );
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
    source: input.frameSource({
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
  cellRole: import('../../visual/frame-source.ts').FrameCellRole = 'text',
  stateOrStates?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> |
    readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const states = stateOrStates === undefined
    ? []
    : typeof stateOrStates === 'string' ? [stateOrStates] : stateOrStates;
  const state = states.at(-1);
  const style = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(states.length === 0 ? {} : { states }),
  });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      partName: part,
      partType: part,
      description,
      cellRole,
      ...(state === undefined ? {} : { interactionState: state }),
    }),
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
