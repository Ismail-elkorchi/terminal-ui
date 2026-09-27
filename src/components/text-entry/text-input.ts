import type { TextInputSubmitEvent, TextInputTransition } from '../../behavior/text-input.ts';
import type {
  ComponentRenderInput,
  SemanticLeafComponentFactory,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import {
  assertOptionalCallback,
  isNonArrayObject,
  nonNegativeSafeInteger as nonNegativeInteger,
} from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import { segmentGraphemes } from '../../text/graphemes.ts';
import { measureTextCells } from '../../text/measure.ts';
import { projectTerminalSingleLineText } from '../../text/sanitize.ts';
import { createTerminalTextIndex } from '../../text/terminal-text-index.ts';
import { terminalTextWidth } from '../../text/terminal-width.ts';
import { normalizeTextCursor, normalizeTextSelection } from '../../text/text-range.ts';
import type { TextEditBuffer, TextSelection, TextWidthProfile } from '../../text/types.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderSpans, span } from '../../visual/render-content.ts';
import {
  assertTransitionCallback,
  withoutTransitionCallback,
} from '../shared/form-control-helpers.ts';
import { optionalBoolean, optionalString } from '../shared/input-control-helpers.ts';
import { inspectTextSelection, inspectTextValue, inspectValidation } from '../shared/inspection.ts';
import type { SingleLineTextWindow } from '../shared/single-line-text-window.ts';
import { layoutSingleLineTextWindow } from '../shared/single-line-text-window.ts';
import { textEntryMarkerSpan } from '../shared/text-entry-marker.ts';
import { textEditingTriggers } from '../shared/text-key-bindings.ts';
import { textPointerTarget } from '../shared/text-pointer-target.ts';
import type { TextEntryStylePart } from '../style-parts.ts';
import type { PasswordInputOptions, TextInputOptions } from './options.ts';


interface TextEntryModel {
  readonly state: TextEditBuffer;
  readonly displayedValue: string;
  readonly displayedCursor: number;
  readonly placeholder: string;
  readonly required: boolean;
  readonly error: string;
  readonly displayedSelection?: TextSelection;
  readonly sourceOffsetForDisplay: (offset: number) => number;
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
  assertOptionalCallback(options.onSubmit, 'textInput onSubmit');
  assertOptionalCallback(options.onContextMenu, 'textInput onContextMenu');
  if (options.onTransition === undefined) {
    if (options.disabled !== true) assertTransitionCallback(options, 'textInput');
    const rest = withoutTransitionCallback(options);
    return textInputDefinition({ ...rest, disabled: true });
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
  assertOptionalCallback(options.onSubmit, 'passwordInput onSubmit');
  assertOptionalCallback(options.onContextMenu, 'passwordInput onContextMenu');
  if (options.onTransition === undefined) {
    if (options.disabled !== true) assertTransitionCallback(options, 'passwordInput');
    const rest = withoutTransitionCallback(options);
    return passwordInputDefinition({ ...rest, disabled: true });
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

function textEntryDefinition<
  TOptions extends TextInputComponentOptions | PasswordInputComponentOptions,
>(
  name: 'text-input' | 'password-input',
  password: boolean,
): TextEntryFactory<TOptions> {
  return defineComponent<TOptions, TextEntryComponentAction>()({
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
        value: inspectTextValue(model.displayedValue),
        ...(model.displayedSelection === undefined
          ? {}
          : { selection: inspectTextSelection(model.displayedSelection) }),
        details: { caretOffset: model.displayedCursor },
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
    retainPaint: true as const,
  render: paintTextEntry,
    keys: ({ model, readOnly }) => ({
      triggers: textEditingTriggers(readOnly, false),
      ...(readOnly ? {} : {
        enter: () => ({ kind: 'submit', value: model.state.text }),
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
        wordSelectionAt: (offset) => createTerminalTextIndex(input.model.state.text, {
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
        value: model.displayedValue,
        textPosition: {
          caretOffset: model.displayedCursor,
          ...(model.displayedSelection === undefined
            ? {}
            : { selection: model.displayedSelection }),
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
  return {
    state,
    ...textEntryDisplay(state, mask),
    placeholder: optionalString(value.placeholder, `${owner} placeholder`) ?? '',
    required: optionalBoolean(value.required, `${owner} required`) ?? false,
    error: optionalString(value.error, `${owner} error`) ?? '',
  };
}

function textEntryDisplay(
  state: TextEditBuffer,
  mask: string | undefined,
): Pick<TextEntryModel, 'displayedValue' | 'displayedCursor' | 'displayedSelection' | 'sourceOffsetForDisplay'> {
  if (mask === undefined) {
    const projection = projectTerminalSingleLineText(state.text);
    const selection = state.selection;
    return {
      displayedValue: projection.text,
      displayedCursor: projection.sourceOffsetToDisplay(state.cursor),
      ...(selection === undefined ? {} : { displayedSelection: {
        startOffset: projection.sourceOffsetToDisplay(selection.startOffset),
        endOffsetExclusive: projection.sourceOffsetToDisplay(selection.endOffsetExclusive),
      } }),
      sourceOffsetForDisplay: (offset) => projection.displayOffsetToSource(offset),
    };
  }
  const graphemes = segmentGraphemes(state.text);
  const maskedOffset = (offset: number): number =>
    graphemes.filter((part) => part.endOffsetExclusive <= offset).length * mask.length;
  const selection = state.selection;
  return {
    displayedValue: mask.repeat(graphemes.length),
    displayedCursor: maskedOffset(state.cursor),
    ...(selection === undefined ? {} : { displayedSelection: {
      startOffset: maskedOffset(selection.startOffset),
      endOffsetExclusive: maskedOffset(selection.endOffsetExclusive),
    } }),
    sourceOffsetForDisplay: (offset) =>
      graphemes[Math.floor(offset / mask.length)]?.startOffset ?? state.text.length,
  };
}

function decodeTextInputState(
  value: TextEditBuffer,
  owner: string,
): TextEditBuffer {
  if (typeof value.text !== 'string') throw new TypeError(`${owner} text must be a string.`);
  const raw = value.text;
  const cursor = nonNegativeInteger(value.cursor, `${owner} cursor`);
  if (cursor > raw.length) throw new RangeError(`${owner} cursor exceeds value length.`);
  const selection = decodeTextSelection(value.selection, raw, owner);
  return { text: raw, cursor: normalizeTextCursor(raw, cursor), ...(selection === undefined ? {} : { selection }) };
}

export function decodeTextSelection(
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

function paintTextEntry(input: ComponentRenderInput<TextEntryModel, TextEntryStylePart>): undefined {
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

export function selectionRanges(
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
    model.displayedCursor,
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
  return model.sourceOffsetForDisplay(displayed[index]?.startOffset ?? model.displayedValue.length);
}
