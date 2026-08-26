import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
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
import { layoutSingleLineTextWindow } from '../internal/single-line-text-window.ts';
import type { SingleLineTextWindow } from '../internal/single-line-text-window.ts';
import type { Element } from '../../element/index.ts';
import type { Measurement } from '../../renderer/index.ts';
import { isNonArrayObject, isStringMember } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  createTerminalTextIndex,
  measureTextCells,
  normalizeTextSelection,
  segmentGraphemes,
  terminalTextWidth,
} from '../../text/index.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { NumberInputControlTransition, NumberInputView } from '../../behavior/number-input.ts';
import type { NumberInputStylePart, TextEntryStylePart } from '../style-parts.ts';
import type { TextInputSubmitEvent, TextInputTransition, TextInputState } from '../../behavior/text-input.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { NumberInputOptions, PasswordInputOptions, TextInputOptions } from '../options/forms.ts';
import { inspectTextSelection, inspectTextValue, inspectValidation } from '../internal/inspection.ts';
import { assertTransitionCallback } from './form-control-helpers.ts';
import {
  cleanString,
  nonNegativeInteger,
  optionalBoolean,
  optionalFinite,
  optionalString,
} from './input-control-helpers.ts';

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
  const plan = textEntryRenderPlan(input);
  input.target.write(0, 0, plan.value);
  if (plan.error !== undefined) input.target.write(1, 0, plan.error);
}

interface TextEntryRenderPlan {
  readonly value: readonly RenderSpan[];
  readonly error?: readonly RenderSpan[];
}

interface TextEntryRenderStyles {
  readonly border: TerminalStyle | undefined;
  readonly value: TerminalStyle | undefined;
  readonly selection: TerminalStyle | undefined;
}

function textEntryRenderPlan(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
): TextEntryRenderPlan {
  const usesPlaceholder = input.model.displayedValue === '' && input.model.placeholder !== '';
  const shown = usesPlaceholder ? input.model.placeholder : input.model.displayedValue;
  const visual = textEntryVisual(input.model, input.bounds.width, input.widthProfile);
  const styles = textEntryRenderStyles(input, usesPlaceholder);
  const spans = [
    textEntryMarkerSpan(input, styles.border),
    ...textEntryContentSpans(input, shown, usesPlaceholder, visual, styles),
  ];
  const occupied = 2 + Number(!usesPlaceholder && visual.clippedBefore) + measureTextCells(
    usesPlaceholder ? shown : visual.visibleText,
    { widthProfile: input.widthProfile },
  ).cells;
  const padding = Math.max(0, input.bounds.width - occupied);
  if (padding > 0) spans.push(textEntryPaddingSpan(input, padding, styles.value));
  const value = clipRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile });
  const error = textEntryErrorSpans(input);
  return { value, ...(error === undefined ? {} : { error }) };
}

function textEntryRenderStyles(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
  usesPlaceholder: boolean,
): TextEntryRenderStyles {
  const border = input.style({
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

function textEntryMarkerSpan(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
  style: TerminalStyle | undefined,
): RenderSpan {
  const marker = input.disabled
    ? ' '
    : input.model.error !== ''
    ? input.theme.tokens.symbols.statusError
    : input.focus === 'self'
    ? input.theme.tokens.symbols.pointer
    : input.theme.tokens.colors['control.background'] === undefined
    ? input.theme.tokens.symbols.borderSingle.vertical
    : ' ';
  return span(`${marker} `, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'border',
      partType: 'frame',
      description: 'frame.prefix',
    }),
  });
}

function textEntryContentSpans(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
  shown: string,
  usesPlaceholder: boolean,
  visual: SingleLineTextWindow,
  styles: TextEntryRenderStyles,
): readonly RenderSpan[] {
  if (usesPlaceholder) {
    return [span(shown, {
      ...(styles.value === undefined ? {} : { style: styles.value }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'placeholder',
        partType: 'placeholder',
        description: 'placeholder',
      }),
    })];
  }
  const spans: RenderSpan[] = [];
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
  spans.push(...textEntryValueSpans(input, shown, visual, styles));
  return spans;
}

function textEntryValueSpans(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
  shown: string,
  visual: SingleLineTextWindow,
  styles: TextEntryRenderStyles,
): readonly RenderSpan[] {
  const selection = input.model.displayedSelection;
  const records = selectionRanges(visual, selection);
  const spans: RenderSpan[] = [];
  for (const record of records) {
    const start = Math.max(visual.startOffset, record.start);
    const end = Math.min(visual.endOffsetExclusive, record.end);
    const current = shown.slice(start, end);
    if (current === '') continue;
    const style = record.selected ? styles.selection : styles.value;
    spans.push(span(current, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        cellRole: 'text',
        partName: record.selected ? 'selection' : 'value',
        partType: record.selected ? 'selection' : 'value',
        description: record.selected ? 'selection' : 'value',
      }),
    }));
  }
  return spans;
}

interface TextEntrySelectionRange {
  readonly start: number;
  readonly end: number;
  readonly selected: boolean;
}

function selectionRanges(
  visual: SingleLineTextWindow,
  selection: TextSelection | undefined,
): readonly TextEntrySelectionRange[] {
  return [
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
}

function textEntryPaddingSpan(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
  width: number,
  style: TerminalStyle | undefined,
): RenderSpan {
  return span(' '.repeat(width), {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'content',
      partName: 'value',
      partType: 'value',
      description: 'value.padding',
    }),
  });
}

function textEntryErrorSpans(
  input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>,
): readonly RenderSpan[] | undefined {
  if (input.model.error === '' || input.bounds.height <= 1) return undefined;
  const style = input.style({
    part: 'error',
    base: { fg: { kind: 'theme', token: 'status.error' }, bold: true },
  });
  return [span(input.model.error, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'text',
      partName: 'error',
      partType: 'error',
      description: 'validation.error',
    }),
  })];
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

function numberInputMarkerSpan(
  input: ComponentRenderInput<NumberModel, NumberInputStylePart>,
  style: TerminalStyle | undefined,
): RenderSpan {
  const marker = input.disabled
    ? ' '
    : input.model.error !== ''
    ? input.theme.tokens.symbols.statusError
    : input.focus === 'self'
    ? input.theme.tokens.symbols.pointer
    : input.theme.tokens.colors['control.background'] === undefined
    ? input.theme.tokens.symbols.borderSingle.vertical
    : ' ';
  return span(`${marker} `, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'border',
      partType: 'frame',
      description: 'frame.prefix',
    }),
  });
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
