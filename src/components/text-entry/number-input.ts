import type { NumberInputControlTransition, NumberInputView } from '../../behavior/number-input.ts';
import type {
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import {
  assertOptionalCallback,
  isNonArrayObject,
  isStringMember,
  nonNegativeSafeInteger as nonNegativeInteger,
} from '../../foundation/validation.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { HitTarget, Measurement } from '../../renderer/contracts.ts';
import { measureTextCells } from '../../text/measure.ts';
import { createTerminalTextIndex } from '../../text/terminal-text-index.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderSpans, measureRenderSpans, span } from '../../visual/render-content.ts';
import {
  assertTransitionCallback,
  withoutTransitionCallback,
} from '../shared/form-control-helpers.ts';
import {
  cleanString,
  optionalBoolean,
  optionalFinite,
  optionalString,
} from '../shared/input-control-helpers.ts';
import { inspectTextSelection, inspectTextValue, inspectValidation } from '../shared/inspection.ts';
import type { SingleLineTextWindow } from '../shared/single-line-text-window.ts';
import { layoutSingleLineTextWindow } from '../shared/single-line-text-window.ts';
import { textEntryMarkerSpan as numberInputMarkerSpan } from '../shared/text-entry-marker.ts';
import { textEditingTriggers } from '../shared/text-key-bindings.ts';
import { textPointerTarget } from '../shared/text-pointer-target.ts';
import type { NumberInputStylePart } from '../style-parts.ts';
import type { NumberInputOptions } from './options.ts';
import { decodeTextSelection, selectionRanges } from './text-input.ts';

interface NumberModel {
  readonly state: NumberInputView;
  readonly placeholder: string;
  readonly required: boolean;
  readonly error: string;
}

type NumberInputFactory = <const TMessage extends ComponentMessage = never>(
  options: NumberInputOptions<TMessage>,
) => Element<TMessage>;

const instantiateNumberInput = defineComponent<Omit<NumberInputOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'>, NumberInputComponentAction>()({
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
  reuse: { paint: (model: object) => [model] as const },
  render: paintNumberInput,
  keys: ({ readOnly }) => ({
    triggers: textEditingTriggers(readOnly),
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
  assertOptionalCallback(options.onContextMenu, 'numberInput onContextMenu');
  if (options.onTransition === undefined) {
    if (options.disabled !== true) assertTransitionCallback(options, 'numberInput');
    const rest = withoutTransitionCallback(options);
    return instantiateNumberInput({ ...rest, disabled: true });
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

type NumberInputComponentAction = NumberInputControlTransition | {
  readonly kind: 'contextMenu';
  readonly event: TextContextMenuEvent;
};

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

function paintNumberInput(input: ComponentRenderInput<NumberModel, NumberInputStylePart>): undefined {
  if (input.bounds.width === 0 || input.bounds.height === 0) return;
  const plan = numberInputRenderPlan(input);
  input.target.write(0, 0, plan.value);
  if (plan.stepper !== undefined) input.target.write(0, plan.valueWidth, plan.stepper);
  if (plan.error !== undefined) input.target.write(1, 0, plan.error);
}

interface NumberInputRenderPlan {
  readonly value: readonly RenderSpan[];
  readonly valueWidth: number;
  readonly stepper?: readonly RenderSpan[];
  readonly error?: readonly RenderSpan[];
}

interface NumberInputRenderStyles {
  readonly border: TerminalStyle | undefined;
  readonly value: TerminalStyle | undefined;
  readonly selection: TerminalStyle | undefined;
}

function numberInputRenderPlan(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
): NumberInputRenderPlan {
  const geometry = numberInputGeometry(input.bounds, input.disabled || input.readOnly);
  const inputBounds = geometry?.input ?? input.bounds;
  const usesPlaceholder = input.model.state.value === '' && input.model.placeholder !== '';
  const shown = usesPlaceholder ? input.model.placeholder : input.model.state.value;
  const visual = numberInputVisual(input.model, inputBounds.width, input.widthProfile);
  const styles = numberInputRenderStyles(input, usesPlaceholder);
  const content = numberInputContentSpans(input, shown, usesPlaceholder, visual, styles);
  const value = paddedNumberInputValue(input, inputBounds.width, content, styles.value);
  const stepper = geometry === undefined ? undefined : numberInputStepperSpans(input);
  const error = numberInputErrorSpans(input);
  return {
    value,
    valueWidth: inputBounds.width,
    ...(stepper === undefined ? {} : { stepper }),
    ...(error === undefined ? {} : { error }),
  };
}

function numberInputRenderStyles(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
  usesPlaceholder: boolean,
): NumberInputRenderStyles {
  const border = input.style({
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
  const value = input.style({
    part: usesPlaceholder ? 'placeholder' : 'value',
    base: {
      fg: { kind: 'theme', token: usesPlaceholder ? 'input.placeholder' : 'control.foreground' },
      bg: { kind: 'theme', token: 'control.background' },
      ...(usesPlaceholder ? { dim: true } : {}),
    },
    ...(input.disabled ? { states: ['disabled'] as const } : {}),
  });
  const selection = input.style({
    part: 'selection',
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
    states: ['selected'],
  });
  return { border, value, selection };
}

function numberInputContentSpans(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
  shown: string,
  usesPlaceholder: boolean,
  visual: SingleLineTextWindow,
  styles: NumberInputRenderStyles,
): readonly RenderSpan[] {
  const selection = usesPlaceholder ? undefined : input.model.state.selection;
  if (usesPlaceholder) {
    return [
      numberInputMarkerSpan(input, styles.border),
      span(shown, {
        ...(styles.value === undefined ? {} : { style: styles.value }),
        source: input.frameSource({
          cellRole: 'text',
          partName: 'placeholder',
          partType: 'placeholder',
          description: 'placeholder',
        }),
      }),
    ];
  }
  const spans: RenderSpan[] = [numberInputMarkerSpan(input, styles.border)];
  if (visual.clippedBefore) {
    spans.push(span('‹', {
      ...(styles.border === undefined ? {} : { style: styles.border }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: 'border',
        partType: 'frame',
        description: 'value.window',
      }),
    }));
  }
  for (const range of selectionRanges(visual, selection)) {
    const start = Math.max(visual.startOffset, range.start);
    const end = Math.min(visual.endOffsetExclusive, range.end);
    const text = shown.slice(start, end);
    if (text === '') continue;
    const style = range.selected ? styles.selection : styles.value;
    spans.push(span(text, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        cellRole: 'text',
        partName: range.selected ? 'selection' : 'value',
        partType: range.selected ? 'selection' : 'value',
        description: range.selected ? 'selection' : 'value',
      }),
    }));
  }
  return spans;
}

function paddedNumberInputValue(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
  width: number,
  content: readonly RenderSpan[],
  style: TerminalStyle | undefined,
): readonly RenderSpan[] {
  const spans = clipRenderSpans(content, width, { widthProfile: input.widthProfile });
  const used = measureRenderSpans(spans, { widthProfile: input.widthProfile });
  if (used >= width) return spans;
  return [
    ...spans,
    span(' '.repeat(width - used), {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        cellRole: 'content',
        partName: 'value',
        partType: 'value',
        description: 'value.padding',
      }),
    }),
  ];
}

function numberInputStepperSpans(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
): readonly RenderSpan[] {
  const style = input.style({ part: 'stepper' });
  const stepperSpan = (text: string, partType: string, description: string): RenderSpan => span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'stepper',
      partType,
      description,
    }),
  });
  return [
    stepperSpan('  ', 'separator', 'step.separator.before'),
    stepperSpan('−', 'decrement', 'step.decrement'),
    stepperSpan('  ', 'separator', 'step.separator.between'),
    stepperSpan('+', 'increment', 'step.increment'),
    stepperSpan(' ', 'separator', 'step.separator.after'),
  ];
}

function numberInputErrorSpans(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
): readonly RenderSpan[] | undefined {
  if (input.model.error === '' || input.bounds.height <= 1) return undefined;
  const style = input.style({
    part: 'error',
    base: { fg: { kind: 'theme', token: 'status.error' }, bold: true },
  });
  return clipRenderSpans(
    [span(input.model.error, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'error',
        partType: 'error',
        description: 'validation.error',
      }),
    })],
    input.bounds.width,
    { widthProfile: input.widthProfile },
  );
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
