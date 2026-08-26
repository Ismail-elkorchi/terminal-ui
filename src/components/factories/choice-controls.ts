import { defineComponent, ignoreMessage, measureRenderSpans, decodeTerminalStyle, span } from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  HitTarget,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings } from '../../element/metadata.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { FocusTarget } from '../../renderer/index.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { CollectionInteractionState, SelectionState } from '../../interaction/collection-interaction.ts';
import { clipTextCells, oneCellGlyph, padTextCells, terminalTextWidth } from '../../text/index.ts';
import type { ChoiceItem } from '../../collection/item.ts';
import type { CheckboxGroupTransition, ColorSwatchPickerTransition, RadioGroupTransition } from '../../behavior/choice-controls.ts';
import type { ChoiceStylePart, ColorSwatchPickerStylePart } from '../style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { CheckboxGroupOptions, ColorSwatchPickerOptions, RadioGroupOptions } from '../options/forms.ts';
import { assertTransitionCallback } from './form-control-helpers.ts';
import {
  assertUnique,
  cleanString,
  controlSpan,
  errorLines,
  measureLines,
  optionalBoolean,
  optionalString,
  paintLines,
  positiveInteger,
  styled,
} from './input-control-helpers.ts';
import { choiceSelectedIds, decodeChoiceState, isChoiceSelected } from './choice-control-helpers.ts';

interface ChoiceModel {
  readonly label: string;
  readonly options: readonly ChoiceModelItem[];
  readonly interaction: CollectionInteractionState;
  readonly required: boolean;
  readonly error: string;
}

type CheckboxGroupComponentOptions = Omit<
  CheckboxGroupOptions<unknown, ComponentMessage>,
  'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'
>;
type RadioGroupComponentOptions = Omit<
  RadioGroupOptions<unknown, ComponentMessage>,
  'id' | 'disabled' | 'onTransition' | 'styles' | 'meta'
>;

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

function singleSelectedId(selection: SelectionState): string | undefined {
  return selection.mode === 'single' ? selection.selectedId : undefined;
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
