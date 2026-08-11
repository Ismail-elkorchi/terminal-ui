import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentLayoutInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  SemanticCompositeComponentFactory,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type {
  ButtonOptions,
  CheckboxOptions,
  FieldOptions,
  FormOptions,
  LabelOptions,
  SelectOptions,
  ToggleSwitchOptions,
} from '../options/forms.ts';
import { inlineSegmentText, normalizeInlineContent } from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import { normalizeSelectState } from '../../behavior/choice-controls.ts';
import { measureTextCells, oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type {
  ButtonAction,
  ButtonTone,
  CheckboxAction,
  ToggleSwitchAction,
} from '../../ui-model/forms.ts';
import type { ButtonStylePart } from '../../ui-model/style-parts.ts';
import type { ChoiceStylePart } from '../../ui-model/style-parts.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { LayoutFlowOptions, Rect } from '../../geometry/types.ts';
import {
  layoutContentBounds,
  layoutInsetSize,
  normalizeLayoutFlowOptions,
  splitTracks,
} from '../../layout/index.ts';
import {
  assertOptionalEnum,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { ChoiceItem } from '../../ui-model/contracts.ts';
import type { SelectAction, SelectPresentation } from '../../ui-model/choice-controls.ts';
import type { ListAction } from '../../ui-model/list.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import { portal, surface } from '../../layout/index.ts';
import { list } from './list.ts';

interface FormModel {
  readonly title: string;
  readonly layout: LayoutFlowOptions;
}

const formSlots = {
  content: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

export const form: SemanticCompositeComponentFactory<
  FormOptions,
  never,
  'title',
  readonly [],
  'optional',
  readonly ['styles', 'layer'],
  typeof formSlots
> = defineComponent<
  FormOptions,
  FormModel,
  never,
  'title',
  readonly [],
  'optional',
  readonly ['styles', 'layer'],
  typeof formSlots
>({
  name: 'terminal-ui/components/form',
  identity: 'optional',
  structure: 'composite',
  semantics: 'semantic',
  slots: formSlots,
  metadata: ['styles', 'layer'],
  parts: ['title'],
  prepare: prepareForm,
  measure(input) {
    const titleWidth =
      measureTextCells(input.model.title, { widthProfile: input.widthProfile }).cells;
    const count = input.slots.count('content');
    const measurements = Array.from(
      { length: count },
      (_unused, index) => input.slots.measure('content', index),
    );
    const gap = input.model.layout.gap ?? 0;
    const padding = layoutInsetSize(input.model.layout.padding);
    const margin = layoutInsetSize(input.model.layout.margin);
    const titleRows = input.model.title.length === 0 ? 0 : 1;
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(titleWidth, ...measurements.map((item) => item.preferredWidth), 0) +
        padding.width + margin.width,
      preferredHeight: titleRows +
        measurements.reduce((height, item) => height + item.preferredHeight, 0) +
        Math.max(0, count - 1) * gap +
        padding.height + margin.height,
    };
  },
  layout(input) {
    const content = formContentBounds(input);
    const count = input.slots.count('content');
    return {
      content: splitTracks(
        content,
        'vertical',
        Array.from({ length: count }, () => ({ kind: 'content' as const })),
        input.model.layout.gap === undefined ? {} : { gap: input.model.layout.gap },
        Array.from(
          { length: count },
          (_unused, index) => input.slots.measure('content', index).preferredHeight,
        ),
      ),
    };
  },
  renderBeforeChildren(input) {
    if (input.model.title.length === 0) return;
    const content = layoutContentBounds(input.bounds, input.model.layout);
    const style = input.style({
      part: 'title',
      base: { fg: { kind: 'theme', token: 'text.strong' }, bold: true },
    });
    input.target.write(content.row, content.column, [{
      text: input.model.title,
      ...(style === undefined ? {} : { style }),
      source: input.source({
        partName: 'title',
        partType: 'title',
        cellRole: 'content',
        description: 'form.title',
      }),
    }]);
  },
  accessibility(input) {
    return {
      id: input.id,
      role: 'form',
      label: input.model.title || input.id,
      ...(input.focused ? { focused: true } : {}),
      children: input.slots.content,
    };
  },
});

function formContentBounds(input: ComponentLayoutInput<FormModel, typeof formSlots>): Rect {
  const content = layoutContentBounds(input.bounds, input.model.layout);
  const titleRows = input.model.title.length === 0 ? 0 : 1;
  return {
    row: content.row + titleRows,
    column: content.column,
    width: content.width,
    height: Math.max(0, content.height - titleRows),
  };
}

function prepareForm(value: Readonly<FormOptions>): FormModel {
  const title = value.title;
  if (title !== undefined && typeof title !== 'string') {
    throw new TypeError('form title must be a string when provided.');
  }
  return {
    title: title === undefined ? '' : sanitizeTerminalText(title).text,
    layout: normalizeLayoutFlowOptions(value, 'form'),
  };
}

interface FieldModel {
  readonly label: string;
  readonly description: string;
  readonly layout: LayoutFlowOptions;
}

const fieldSlots = {
  content: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

type FieldFactory = <TChild extends Element<ComponentMessage>>(
  options: FieldOptions<TChild>,
) => Element<import('../../element/index.ts').ElementMessage<TChild>>;

export const field: FieldFactory = defineComponent<
  { readonly label: string; readonly description?: string } & LayoutFlowOptions,
  FieldModel,
  never,
  import('../../ui-model/style-parts.ts').FormGroupStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer'],
  typeof fieldSlots
>({
  name: 'terminal-ui/components/field',
  identity: 'optional',
  structure: 'composite',
  semantics: 'semantic',
  slots: fieldSlots,
  metadata: ['styles', 'layer'],
  parts: ['label', 'description'],
  prepare(value) {
    const label = value.label;
    const description = value.description;
    if (typeof label !== 'string') throw new TypeError('field label must be a string.');
    if (description !== undefined && typeof description !== 'string') {
      throw new TypeError('field description must be a string.');
    }
    return {
      label: sanitizeTerminalText(label).text,
      description: description === undefined ? '' : sanitizeTerminalText(description).text,
      layout: normalizeLayoutFlowOptions(value, 'field'),
    };
  },
  measure(input) {
    const header = fieldHeader(input.model);
    const width = Math.max(
      ...header.map((entry) => measureTextCells(entry, { widthProfile: input.widthProfile }).cells),
      ...Array.from(
        { length: input.slots.count('content') },
        (_unused, index) => input.slots.measure('content', index).preferredWidth,
      ),
      0,
    );
    const height = header.length +
      Array.from(
        { length: input.slots.count('content') },
        (_unused, index) => input.slots.measure('content', index).preferredHeight,
      )
        .reduce((sum, current) => sum + current, 0) +
      Math.max(0, input.slots.count('content') - 1) * (input.model.layout.gap ?? 0);
    const inset = layoutInsetSize(input.model.layout.padding);
    const margin = layoutInsetSize(input.model.layout.margin);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: width + inset.width + margin.width,
      preferredHeight: height + inset.height + margin.height,
    };
  },
  layout(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    const headerRows = fieldHeader(input.model).length;
    const childBounds = {
      row: content.row + Math.min(headerRows, content.height),
      column: content.column,
      width: content.width,
      height: Math.max(0, content.height - headerRows),
    };
    const count = input.slots.count('content');
    return {
      content: splitTracks(
        childBounds,
        'vertical',
        Array.from({ length: count }, () => ({ kind: 'content' as const })),
        input.model.layout.gap === undefined ? {} : { gap: input.model.layout.gap },
        Array.from(
          { length: count },
          (_unused, index) => input.slots.measure('content', index).preferredHeight,
        ),
      ),
    };
  },
  renderBeforeChildren(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    fieldHeader(input.model).slice(0, content.height).forEach((textValue, row) => {
      const part = row === 0 && input.model.label.length > 0
        ? 'label' as const
        : 'description' as const;
      const style = input.style({
        part,
        ...(part === 'description'
          ? { base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true } }
          : {}),
      });
      input.target.write(
        content.row + row,
        content.column,
        clipRenderSpans(
          [
            span(textValue, {
              ...(style === undefined ? {} : { style }),
              source: input.source({
                partName: `field.${part}`,
                cellRole: 'text',
                description: part === 'label' ? 'field.label.text' : 'field.description',
              }),
            }),
          ],
          content.width,
          { widthProfile: input.widthProfile },
        ),
      );
    });
  },
  accessibility(input) {
    return {
      id: input.id,
      role: 'group',
      label: input.model.label || input.id,
      ...(input.model.description.length === 0 ? {} : { description: input.model.description }),
      ...(input.focused ? { focused: true } : {}),
      children: input.slots.content,
    };
  },
});

function fieldHeader(model: FieldModel): readonly string[] {
  return [
    ...(model.label.length === 0 ? [] : [model.label]),
    ...(model.description.length === 0 ? [] : [model.description]),
  ];
}

interface LabelModel {
  readonly text: string;
  readonly forId: string;
}

export const label: SemanticLeafComponentFactory<
  Pick<LabelOptions, 'text' | 'forId'>,
  never,
  import('../../ui-model/style-parts.ts').FormGroupStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<LabelOptions, 'text' | 'forId'>,
  LabelModel,
  never,
  import('../../ui-model/style-parts.ts').FormGroupStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/label',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['label', 'description'],
  prepare(value) {
    const textValue = value.text;
    const forId = value.forId;
    if (typeof textValue !== 'string') throw new TypeError('label text must be a string.');
    if (typeof forId !== 'string' || forId.trim().length === 0) {
      throw new TypeError('label forId must be a non-empty string.');
    }
    return {
      text: sanitizeTerminalText(textValue).text,
      forId: sanitizeTerminalText(forId).text,
    };
  },
  measure({ model, widthProfile }) {
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: measureTextCells(model.text, { widthProfile }).cells,
      preferredHeight: 1,
    };
  },
  render(input) {
    const style = input.style({ part: 'label' });
    input.target.write(
      0,
      0,
      clipRenderSpans(
        [span(input.model.text, {
          ...(style === undefined ? {} : { style }),
          source: input.source({ partName: 'label.text', cellRole: 'text' }),
        })],
        input.bounds.width,
        { widthProfile: input.widthProfile },
      ),
    );
  },
  accessibility({ id, model }) {
    return { id, role: 'text', label: model.text || id, controls: model.forId };
  },
});

interface ButtonModel {
  readonly label: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone: ButtonTone;
  readonly density: ComponentDensity;
  readonly pointerState?: PointerInteractionState;
}

type ButtonOwnOptions = Pick<
  ButtonOptions<ComponentMessage>,
  'label' | 'leading' | 'trailing' | 'tone' | 'density' | 'pointerState'
>;

export const button: SemanticLeafComponentFactory<
  ButtonOwnOptions,
  ButtonAction,
  ButtonStylePart,
  readonly ['disabled', 'busy'],
  'required',
  readonly ['styles', 'layer', 'focus']
> = defineComponent<
  ButtonOwnOptions,
  ButtonModel,
  ButtonAction,
  ButtonStylePart,
  readonly ['disabled', 'busy'],
  'required',
  readonly ['styles', 'layer', 'focus']
>({
  name: 'terminal-ui/components/button',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  states: ['disabled', 'busy'],
  metadata: ['styles', 'layer', 'focus'],
  parts: ['frame', 'marker', 'leading', 'label', 'trailing'],
  prepare(value) {
    const label = value.label;
    const leading = value.leading;
    const trailing = value.trailing;
    const tone = value.tone;
    const density = value.density;
    const pointerState = value.pointerState;
    if (typeof label !== 'string') throw new TypeError('button label must be a string.');
    if (tone !== undefined && !isButtonTone(tone)) throw new TypeError('button tone is invalid.');
    assertOptionalEnum(density, ['compact', 'regular'], 'button density');
    assertPointerState(pointerState);
    return {
      label: sanitizeTerminalText(label).text,
      ...(leading === undefined
        ? {}
        : { leading: normalizeInlineContent(leading) }),
      ...(trailing === undefined
        ? {}
        : { trailing: normalizeInlineContent(trailing) }),
      tone: tone ?? 'default',
      density: density ?? 'regular',
      ...(pointerState === undefined ? {} : { pointerState }),
    };
  },
  measure(input) {
    const spans = buttonSpans(input, false);
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: measureSpans(spans, input.widthProfile),
      preferredHeight: 1,
    };
  },
  render(input) {
    const spans = buttonSpans(input, input.focus === 'self');
    const used = measureSpans(spans, input.widthProfile);
    const visualState = buttonVisualState(input, input.focus === 'self');
    const frameStyle = input.style({
      part: 'frame',
      ...(visualState === undefined ? {} : { state: visualState }),
      base: buttonToneStyle(input.model.tone, true, input.busy),
    });
    input.target.write(0, 0, [
      ...spans,
      ...(used >= input.target.width ? [] : [{
        text: ' '.repeat(input.target.width - used),
        ...(frameStyle === undefined ? {} : { style: frameStyle }),
        source: input.source({ partName: 'frame.fill', partType: 'frame', cellRole: 'content' }),
      }]),
    ]);
  },
  keys: () => ({
    enter: () => ({ kind: 'press' }),
    space: () => ({ kind: 'press' }),
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, bounds }) => [{
    id: `${id ?? 'button'}:control`,
    bounds,
    focus: { kind: 'target', targetId: 'self' },
    accepts: ['click'],
    message: (event) => event.kind === 'click' ? { kind: 'press' } : ignoreMessage(),
    cursor: 'pointer',
  }],
  accessibility({ id, model, focused, busy }) {
    return {
      id,
      role: 'button',
      label: model.label || id,
      ...(busy ? { description: 'Busy.' } : {}),
      ...(focused ? { focused: true } : {}),
    };
  },
});

type ButtonVisualInput =
  | ComponentMeasureInput<ButtonModel>
  | ComponentRenderInput<ButtonModel, ButtonStylePart>;

function buttonSpans(input: ButtonVisualInput, focused: boolean): readonly RenderSpan[] {
  const state = buttonVisualState(input, focused);
  const frameStyle = resolveButtonStyle(
    input,
    'frame',
    buttonToneStyle(input.model.tone, true, input.busy),
    state,
  );
  const labelStyle = resolveButtonStyle(
    input,
    'label',
    buttonToneStyle(input.model.tone, false, input.busy),
    state,
  );
  const compact = input.model.density === 'compact';
  const targetId = `${input.id ?? 'button'}:control`;
  const pointerState = pointerVisualState(input.model.pointerState, targetId);
  const marker = oneCellGlyph(
    input.busy
      ? input.theme.tokens.symbols.statusInfo
      : pointerState === 'pressed'
      ? input.theme.tokens.symbols.selected
      : input.model.tone === 'destructive'
      ? input.theme.tokens.symbols.statusError
      : focused && !input.disabled
      ? input.theme.tokens.symbols.pointer
      : ' ',
    ' ',
    { widthProfile: input.widthProfile },
  );
  const spans: RenderSpan[] = [componentSpan(
    input,
    compact ? marker : `${marker} `,
    'frame',
    'padding.leading',
    frameStyle,
    state,
  )];
  if (input.model.leading !== undefined) {
    spans.push(...buttonInlineSpans(input, input.model.leading, 'leading', labelStyle, state));
    spans.push(componentSpan(input, ' ', 'frame', 'separator.leading', frameStyle, state));
  }
  spans.push(
    componentSpan(input, input.model.label || 'Button', 'label', 'label.text', labelStyle, state),
  );
  if (input.model.trailing !== undefined) {
    spans.push(componentSpan(input, ' ', 'frame', 'separator.trailing', frameStyle, state));
    spans.push(...buttonInlineSpans(input, input.model.trailing, 'trailing', labelStyle, state));
  }
  spans.push(
    componentSpan(input, compact ? ' ' : '  ', 'frame', 'padding.trailing', frameStyle, state),
  );
  return spans;
}

function buttonInlineSpans(
  input: ButtonVisualInput,
  content: InlineContent,
  part: 'leading' | 'trailing',
  base: TerminalStyle | undefined,
  state: ElementVisualState | undefined,
): readonly RenderSpan[] {
  return content.map((segment, index) => {
    const style = resolveButtonStyle(
      input,
      part,
      mergeStyles(
        base,
        segment.link === undefined
          ? undefined
          : { fg: { kind: 'theme', token: 'link.foreground' }, underline: true },
        segment.style,
      ),
      state,
    );
    return {
      text: inlineSegmentText(segment, input.theme.tokens.symbols.mode),
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      ...componentSource(input, part, `${part}.${String(index)}`, state),
    };
  });
}

function componentSpan(
  input: ButtonVisualInput,
  text: string,
  part: ButtonStylePart,
  partName: string,
  style: TerminalStyle | undefined,
  state: ElementVisualState | undefined,
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...componentSource(input, part, partName, state),
  };
}

function componentSource(
  input: ButtonVisualInput,
  part: ButtonStylePart,
  partName: string,
  state: ElementVisualState | undefined,
): Pick<RenderSpan, 'source'> {
  if (!('source' in input)) return {};
  return {
    source: input.source({
      cellRole: part === 'leading' || part === 'label' || part === 'trailing'
        ? 'text'
        : 'decoration',
      partName,
      partType: part,
      description: partName,
      ...(state === undefined || state === 'default' ? {} : { interactionState: state }),
    }),
  };
}

function resolveButtonStyle(
  input: ButtonVisualInput,
  part: ButtonStylePart,
  base: TerminalStyle | undefined,
  state: ElementVisualState | undefined,
): TerminalStyle | undefined {
  const resolvedBase = mergeStyles(
    base,
    input.model.tone === 'ghost' &&
      (state === 'focused' || state === 'hovered' || state === 'pressed')
      ? { bg: { kind: 'theme', token: 'focus.background' } }
      : undefined,
  );
  return 'style' in input
    ? input.style({
      part,
      ...(resolvedBase === undefined ? {} : { base: resolvedBase }),
      ...(state === undefined ? {} : { state }),
    })
    : resolvedBase;
}

function buttonVisualState(
  input: ButtonVisualInput,
  focused: boolean,
): ElementVisualState | undefined {
  if (input.disabled) return 'disabled';
  const pointer = pointerVisualState(input.model.pointerState, `${input.id ?? 'button'}:control`);
  if (pointer === 'pressed') return 'pressed';
  if (focused) return 'focused';
  return pointer;
}

function buttonToneStyle(tone: ButtonTone, frame: boolean, busy: boolean): TerminalStyle {
  if (busy) return { fg: { kind: 'theme', token: 'status.pending' }, bold: true };
  if (tone === 'destructive') return { fg: { kind: 'theme', token: 'status.error' }, bold: true };
  if (tone === 'ghost') return { fg: { kind: 'theme', token: 'control.foreground' } };
  if (tone === 'primary') {
    return {
      fg: { kind: 'theme', token: frame ? 'control.primary.border' : 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.primary.background' },
      bold: true,
    };
  }
  if (tone === 'secondary') {
    return {
      fg: {
        kind: 'theme',
        token: frame ? 'control.secondary.border' : 'control.secondary.foreground',
      },
      bg: { kind: 'theme', token: 'control.secondary.background' },
    };
  }
  return {
    fg: { kind: 'theme', token: frame ? 'control.border' : 'control.foreground' },
    bg: { kind: 'theme', token: 'control.background' },
  };
}

function mergeStyles(...values: readonly (TerminalStyle | undefined)[]): TerminalStyle | undefined {
  let result: TerminalStyle = {};
  for (const value of values) {
    if (value !== undefined) result = { ...result, ...value };
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function measureSpans(spans: readonly RenderSpan[], widthProfile: TextWidthProfile): number {
  return spans.reduce(
    (width, span) => width + measureTextCells(span.text, { widthProfile }).cells,
    0,
  );
}

function assertPointerState(value: PointerInteractionState | undefined): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) {
    throw new TypeError('button pointerState must be an object.');
  }
  for (const field of ['hoveredTargetId', 'pressedTargetId']) {
    const member = value[field];
    if (member !== undefined && typeof member !== 'string') {
      throw new TypeError(`button pointerState.${field} must be a string.`);
    }
  }
}

function isButtonTone(value: unknown): value is ButtonTone {
  return value === 'default' ||
    value === 'primary' ||
    value === 'secondary' ||
    value === 'ghost' ||
    value === 'destructive';
}

interface CheckboxModel {
  readonly label: string;
  readonly checked: boolean;
  readonly required: boolean;
  readonly error: string;
  readonly pointerState?: PointerInteractionState;
}

export const checkbox: SemanticLeafComponentFactory<
  Pick<CheckboxOptions<ComponentMessage>, 'label' | 'checked' | 'required' | 'error' | 'pointerState'>,
  CheckboxAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
> = defineComponent<
  Pick<CheckboxOptions<ComponentMessage>, 'label' | 'checked' | 'required' | 'error' | 'pointerState'>,
  CheckboxModel,
  CheckboxAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/checkbox',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'marker', 'option', 'description', 'error'],
  prepare(value) {
    const label = value.label;
    const checked = value.checked;
    const required = value.required;
    const error = value.error;
    const pointerState = value.pointerState;
    if (typeof label !== 'string') throw new TypeError('checkbox label must be a string.');
    if (typeof checked !== 'boolean') throw new TypeError('checkbox checked must be a boolean.');
    if (required !== undefined && typeof required !== 'boolean') {
      throw new TypeError('checkbox required must be a boolean.');
    }
    if (error !== undefined && typeof error !== 'string') {
      throw new TypeError('checkbox error must be a string.');
    }
    assertPointerStateFor('checkbox', pointerState);
    return {
      label: sanitizeTerminalText(label).text,
      checked,
      required: required === true,
      error: error === undefined ? '' : sanitizeTerminalText(error).text,
      ...(pointerState === undefined ? {} : { pointerState }),
    };
  },
  measure(input) {
    const lines = checkboxLines(input, false);
    return controlMeasurement(lines, input.widthProfile);
  },
  render(input) {
    writeControlLines(input, checkboxLines(input, true));
  },
  keys: ({ model }) => ({
    enter: () => ({ kind: 'change', checked: !model.checked }),
    space: () => ({ kind: 'change', checked: !model.checked }),
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds }) => [{
    id: `${id ?? 'checkbox'}:control`,
    bounds,
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'change', checked: !model.checked }),
  }],
  accessibility({ id, model, focused, disabled }) {
    const description = [model.required ? 'Required.' : '', model.error]
      .filter((value) => value.length > 0).join(' ');
    return {
      id,
      role: 'checkbox',
      label: model.required ? `${model.label} *` : model.label || id,
      checked: model.checked,
      ...(description.length === 0 ? {} : { description }),
      ...(focused ? { focused: true } : {}),
      ...(disabled ? { disabled: true } : {}),
    };
  },
});

interface ToggleModel {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel: string;
  readonly offLabel: string;
  readonly error: string;
  readonly pointerState?: PointerInteractionState;
}

export const toggleSwitch: SemanticLeafComponentFactory<
  Pick<
    ToggleSwitchOptions<ComponentMessage>,
    'label' | 'checked' | 'onLabel' | 'offLabel' | 'error' | 'pointerState'
  >,
  ToggleSwitchAction,
  import('../../ui-model/style-parts.ts').ToggleStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
> = defineComponent<
  Pick<
    ToggleSwitchOptions<ComponentMessage>,
    'label' | 'checked' | 'onLabel' | 'offLabel' | 'error' | 'pointerState'
  >,
  ToggleModel,
  ToggleSwitchAction,
  import('../../ui-model/style-parts.ts').ToggleStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/toggle-switch',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'track', 'handle', 'onLabel', 'offLabel', 'error'],
  prepare(value) {
    const label = value.label;
    const checked = value.checked;
    const onLabel = value.onLabel;
    const offLabel = value.offLabel;
    const error = value.error;
    const pointerState = value.pointerState;
    if (typeof label !== 'string') throw new TypeError('toggleSwitch label must be a string.');
    if (typeof checked !== 'boolean') {
      throw new TypeError('toggleSwitch checked must be a boolean.');
    }
    if (onLabel !== undefined && typeof onLabel !== 'string') {
      throw new TypeError('toggleSwitch onLabel must be a string.');
    }
    if (offLabel !== undefined && typeof offLabel !== 'string') {
      throw new TypeError('toggleSwitch offLabel must be a string.');
    }
    if (error !== undefined && typeof error !== 'string') {
      throw new TypeError('toggleSwitch error must be a string.');
    }
    assertPointerStateFor('toggleSwitch', pointerState);
    return {
      label: sanitizeTerminalText(label).text,
      checked,
      onLabel: onLabel === undefined ? 'On' : sanitizeTerminalText(onLabel).text,
      offLabel: offLabel === undefined ? 'Off' : sanitizeTerminalText(offLabel).text,
      error: error === undefined ? '' : sanitizeTerminalText(error).text,
      ...(pointerState === undefined ? {} : { pointerState }),
    };
  },
  measure(input) {
    return controlMeasurement(toggleLines(input, false), input.widthProfile);
  },
  render(input) {
    writeControlLines(input, toggleLines(input, true));
  },
  keys: ({ model }) => ({
    enter: () => ({ kind: 'change', checked: !model.checked }),
    space: () => ({ kind: 'change', checked: !model.checked }),
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds }) => [{
    id: `${id ?? 'toggleSwitch'}:control`,
    bounds,
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'change', checked: !model.checked }),
  }],
  accessibility({ id, model, focused, disabled }) {
    return {
      id,
      role: 'switch',
      label: model.label || id,
      value: model.checked ? model.onLabel : model.offLabel,
      checked: model.checked,
      ...(model.error.length === 0 ? {} : { description: model.error }),
      ...(focused ? { focused: true } : {}),
      ...(disabled ? { disabled: true } : {}),
    };
  },
});

interface ControlVisualInput<TModel extends object, TPart extends string> {
  readonly id?: string;
  readonly model: TModel;
  readonly disabled: boolean;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly focus?: import('../../renderer/index.ts').RenderFocusRelation;
  readonly style?: (
    input: import('../../component/index.ts').ComponentStyleInput<TPart>,
  ) => TerminalStyle | undefined;
  readonly source?: (
    input?: import('../../component/index.ts').ComponentSourceInput,
  ) => import('../../visual/source.ts').FrameCellSource;
}

function checkboxLines(
  input: ControlVisualInput<CheckboxModel, ChoiceStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const state = controlVisualState(input, `${input.id ?? 'checkbox'}:control`);
  const marker = input.model.checked
    ? input.theme.tokens.symbols.checkboxChecked
    : input.theme.tokens.symbols.checkboxUnchecked;
  const label = input.model.required ? `${input.model.label} *` : input.model.label;
  return [[
    controlVisualSpan(
      input,
      marker,
      'marker',
      'marker',
      state,
      decorated,
      input.model.checked
        ? { fg: { kind: 'theme', token: 'accent.primary' }, bold: true }
        : undefined,
    ),
    controlVisualSpan(input, ' ', 'option', 'separator', state, decorated),
    controlVisualSpan(
      input,
      label,
      'label',
      input.model.required ? 'label.required' : 'label.text',
      state,
      decorated,
    ),
  ], ...controlErrorLine(input, input.model.error, 'error', state, decorated)];
}

function toggleLines(
  input: ControlVisualInput<ToggleModel, import('../../ui-model/style-parts.ts').ToggleStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const state = controlVisualState(input, `${input.id ?? 'toggleSwitch'}:control`);
  const thumb = oneCellGlyph(input.theme.tokens.symbols.radioChecked, '*', {
    widthProfile: input.widthProfile,
  });
  const track = oneCellGlyph(input.theme.tokens.symbols.scrollbarHorizontalThumb, '-', {
    widthProfile: input.widthProfile,
  });
  const trackStyle: TerminalStyle = input.model.checked
    ? {
      fg: { kind: 'theme', token: 'control.primary.foreground' },
      bg: { kind: 'theme', token: 'control.toggle.on.background' },
      bold: true,
    }
    : {
      fg: { kind: 'theme', token: 'control.foreground' },
      bg: { kind: 'theme', token: 'control.toggle.off.background' },
    };
  const valuePart = input.model.checked ? 'onLabel' as const : 'offLabel' as const;
  return [[
    ...(input.model.label.length === 0 ? [] : [
      controlVisualSpan(input, `${input.model.label}: `, 'label', 'label.text', state, decorated),
    ]),
    controlVisualSpan(
      input,
      input.model.checked ? `${track}${thumb}` : `${thumb}${track}`,
      'track',
      'switch.track',
      state,
      decorated,
      trackStyle,
    ),
    controlVisualSpan(input, ' ', 'track', 'separator', state, decorated),
    controlVisualSpan(
      input,
      input.model.checked ? input.model.onLabel : input.model.offLabel,
      valuePart,
      input.model.checked ? 'value.on' : 'value.off',
      state,
      decorated,
      trackStyle,
    ),
  ], ...controlErrorLine(input, input.model.error, 'error', state, decorated)];
}

function controlErrorLine<TModel extends object, TPart extends string>(
  input: ControlVisualInput<TModel, TPart>,
  error: string,
  part: TPart,
  state: Exclude<ElementVisualState, 'default'> | undefined,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  return error.length === 0 ? [] : [[controlVisualSpan(
    input,
    error,
    part,
    'validation.error',
    state,
    decorated,
    { fg: { kind: 'theme', token: 'status.error' }, bold: true },
  )]];
}

function controlVisualSpan<TModel extends object, TPart extends string>(
  input: ControlVisualInput<TModel, TPart>,
  textValue: string,
  part: TPart,
  partName: string,
  state: Exclude<ElementVisualState, 'default'> | undefined,
  decorated: boolean,
  base?: TerminalStyle,
): RenderSpan {
  if (!decorated || input.style === undefined || input.source === undefined) {
    return { text: textValue };
  }
  const style = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state }),
  });
  return {
    text: textValue,
    ...(style === undefined ? {} : { style }),
    source: input.source({
      partName,
      partType: part,
      description: partName,
      cellRole: part === 'marker' || part === 'track' ? 'decoration' : 'text',
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  };
}

function controlVisualState<TModel extends { readonly pointerState?: PointerInteractionState }>(
  input: Pick<ControlVisualInput<TModel, string>, 'id' | 'model' | 'disabled' | 'focus'>,
  targetId: string,
): Exclude<ElementVisualState, 'default'> | undefined {
  if (input.disabled) return 'disabled';
  if (input.focus === 'self') return 'focused';
  return pointerVisualState(input.model.pointerState, targetId);
}

function controlMeasurement(
  lines: readonly (readonly RenderSpan[])[],
  widthProfile: TextWidthProfile,
): import('../../renderer/index.ts').Measurement {
  return {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: Math.max(0, ...lines.map((current) => measureSpans(current, widthProfile))),
    preferredHeight: lines.length,
  };
}

function writeControlLines<TModel extends object, TPart extends string>(
  input: import('../../component/index.ts').ComponentRenderInput<TModel, TPart>,
  lines: readonly (readonly RenderSpan[])[],
): void {
  lines.slice(0, input.bounds.height).forEach((current, row) => {
    const clipped = clipRenderSpans(current, input.bounds.width, {
      widthProfile: input.widthProfile,
    });
    input.target.write(row, 0, clipped);
    const used = measureRenderSpans(clipped, { widthProfile: input.widthProfile });
    const fill = clipped.at(-1);
    if (used < input.bounds.width && fill !== undefined) {
      input.target.write(row, used, [{
        text: ' '.repeat(input.bounds.width - used),
        ...(fill.style === undefined ? {} : { style: fill.style }),
        ...(fill.source === undefined ? {} : {
          source: {
            ...fill.source,
            cellRole: 'decoration',
            partName: 'padding',
            partType: 'spacing',
            description: 'padding',
          },
        }),
      }]);
    }
  });
}

function assertPointerStateFor(
  owner: string,
  value: PointerInteractionState | undefined,
): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} pointerState must be an object.`);
  for (const field of ['hoveredTargetId', 'pressedTargetId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`${owner} pointerState.${field} must be a string.`);
    }
  }
}

interface SelectOptionModel {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
}

interface SelectModel {
  readonly label: string;
  readonly options: readonly SelectOptionModel[];
  readonly presentation: SelectPresentation;
  readonly placeholder: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleOptions: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly required: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
}

const selectSlots = {
  popup: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

type SelectFactory = <TValue, const TMessage extends ComponentMessage = never>(
  options: SelectOptions<TValue, TMessage>,
) => Element<TMessage>;

const instantiateSelect = defineComponent<
  SelectModel,
  SelectModel,
  SelectAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof selectSlots
>({
  name: 'terminal-ui/components/select',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: selectSlots,
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'marker', 'option', 'description', 'error'],
  implementationSlots(input) {
    if (input.model.presentation.kind === 'closed') return { popup: undefined };
    const id = input.id ?? 'select';
    const highlighted = input.model.presentation.highlighted;
    const common = {
      id: `${id}:popup:list`,
      items: input.model.options,
      projectItem: (option: SelectOptionModel) => option,
      ...(highlighted === undefined ? {} : { selectedId: highlighted }),
      meta: {
        focus: { disabled: true },
        ...(input.styles === undefined ? {} : { styles: selectPopupStyles(input.styles) }),
      },
    };
    const popupList = input.model.presentation.scroll === undefined
      ? list<SelectOptionModel, ComponentMessage>({
        ...common,
        onAction: (action) => input.emit(selectActionForList(action)),
      })
      : list<SelectOptionModel, ComponentMessage>({
        ...common,
        scroll: input.model.presentation.scroll,
        ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
        onAction: (action) => input.emit(selectActionForList(action)),
      });
    return {
      popup: portal(
        surface(popupList, {
          id: `${id}:popup:surface`,
          appearance: 'raised',
          border: { kind: 'single' },
          maxHeight: input.model.maxVisibleOptions + 2,
        }),
        {
          id: `${id}:popup`,
          anchor: { kind: 'allocation' },
          placement: input.model.placement,
          margin: 0,
          onOutsidePress: () => input.emit({ kind: 'dismiss', reason: 'outsidePress' }),
          meta: { layer: { zIndex: 20, underlay: 'clear' } },
        },
      ),
    };
  },
  measure(input) {
    const selected = selectedSelectOption(input.model);
    const value = selected?.label ?? input.model.placeholder;
    const label = input.model.required ? `${input.model.label} *` : input.model.label;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth:
        measureTextCells(`${label}: ${value}  `, { widthProfile: input.widthProfile }).cells,
      preferredHeight: input.model.error === undefined ? 1 : 2,
    };
  },
  layout({ bounds }) {
    return { popup: bounds };
  },
  renderBeforeChildren(input) {
    renderSelect(input);
  },
  keys({ id, model }) {
    const whenSelf =
      (action: import('../../interaction/index.ts').MessageResolution<SelectAction>) =>
      (event: { readonly focusPath: readonly string[] }) =>
        event.focusPath.at(-1) === id ? action : ignoreMessage();
    const highlighted = model.presentation.kind === 'open'
      ? model.presentation.highlighted
      : undefined;
    return {
      arrowDown: whenSelf({ kind: 'move', delta: 1 }),
      arrowUp: whenSelf({ kind: 'move', delta: -1 }),
      home: whenSelf({ kind: 'first' }),
      end: whenSelf({ kind: 'last' }),
      space: whenSelf({ kind: 'toggle' }),
      enter: whenSelf(
        model.presentation.kind === 'closed'
          ? { kind: 'open' }
          : highlighted === undefined
          ? ignoreMessage()
          : { kind: 'commit', id: highlighted },
      ),
      escape: whenSelf(
        model.presentation.kind === 'open'
          ? { kind: 'dismiss', reason: 'escape' }
          : ignoreMessage(),
      ),
    };
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, bounds, model }) => [{
    id: `${id ?? 'select'}:trigger`,
    bounds: { ...bounds, height: Math.min(1, bounds.height) },
    accepts: ['click'],
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'toggle' }),
    cursor: 'pointer',
    ...(model.presentation.kind === 'open' ? { zIndex: 21 } : {}),
  }],
  accessibility(input) {
    return selectAccessibility(input);
  },
});

export const select: SelectFactory = (options) => {
  if (options.disabled === true && Object.hasOwn(options, 'onAction')) {
    throw new TypeError('Disabled component "terminal-ui/components/select" cannot accept onAction.');
  }
  const model = prepareSelect(options);
  const shared = {
    ...model,
    id: options.id,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  return options.disabled === true
    ? instantiateSelect({ ...shared, disabled: true })
    : instantiateSelect({ ...shared, onAction: options.onAction });
};

function selectedSelectOption(model: SelectModel): SelectOptionModel | undefined {
  return model.options.find((option) => option.id === model.presentation.selected);
}

function renderSelect(input: ComponentRenderInput<SelectModel, ChoiceStylePart>): void {
  const selected = selectedSelectOption(input.model);
  const value = selected?.label ?? input.model.placeholder;
  const state = input.disabled
    ? 'disabled' as const
    : pointerVisualState(input.model.pointerState, `${input.id ?? 'select'}:trigger`) ??
      (input.focus === 'self' ? 'focused' as const : undefined);
  const label = input.model.required ? `${input.model.label} *` : input.model.label;
  const labelStyle = input.style({
    part: 'label',
    ...(state === undefined ? {} : { state }),
    base: { fg: { kind: 'theme', token: 'text.strong' }, bold: true },
  });
  const valuePart: ChoiceStylePart = selected === undefined ? 'description' : 'option';
  const valueStyle = input.style({
    part: valuePart,
    ...(state === undefined ? {} : { state }),
    base: selected === undefined
      ? { fg: { kind: 'theme', token: 'input.placeholder' }, dim: true }
      : { fg: { kind: 'theme', token: 'text.default' } },
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(state === undefined ? {} : { state }),
    base: { fg: { kind: 'theme', token: 'control.foreground' } },
  });
  input.target.write(0, 0, [
    selectSpan(input, label, 'label', 'label', labelStyle),
    selectSpan(input, ': ', 'label', 'label.separator', labelStyle),
    selectSpan(
      input,
      value,
      valuePart,
      selected === undefined ? 'value.placeholder' : 'value.selected',
      valueStyle,
    ),
    selectSpan(input, ' ', 'marker', 'value.separator', markerStyle),
    selectSpan(
      input,
      input.model.presentation.kind === 'open'
        ? input.theme.tokens.symbols.expanded
        : input.theme.tokens.symbols.collapsed,
      'marker',
      'value.disclosure',
      markerStyle,
    ),
  ]);
  if (input.model.error !== undefined && input.bounds.height > 1) {
    const errorStyle = input.style({
      part: 'error',
      base: { fg: { kind: 'theme', token: 'status.error' } },
    });
    input.target.write(1, 0, [
      selectSpan(input, input.model.error, 'error', 'validation.error', errorStyle),
    ]);
  }
}

function selectSpan(
  input: ComponentRenderInput<SelectModel, ChoiceStylePart>,
  text: string,
  part: ChoiceStylePart,
  partName: string,
  style: TerminalStyle | undefined,
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: input.source({ partName, partType: part, cellRole: 'text', description: partName }),
  };
}

function selectAccessibility(
  input: ComponentAccessibilityInput<SelectModel, typeof selectSlots>,
): import('../../accessibility/index.ts').AccessibleNode {
  const selected = selectedSelectOption(input.model);
  const description = [input.model.required ? 'Required.' : '', input.model.error ?? '']
    .filter((part) => part.length > 0)
    .join(' ');
  const open = input.model.presentation.kind === 'open' ? input.model.presentation : undefined;
  return {
    id: input.id,
    role: 'combobox',
    label: input.model.required ? `${input.model.label} *` : input.model.label,
    expanded: input.model.presentation.kind === 'open',
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(input.focused ? { focused: true } : {}),
    ...(open === undefined ? { children: [] } : {
      children: [{
        id: `${input.id}:options`,
        role: 'listbox' as const,
        label: `${input.model.label || input.id} options`,
        children: input.model.options.map((option) => ({
          id: `${input.id}:${option.id}`,
          role: 'option' as const,
          label: option.label,
          selected: option.id === open.selected,
          ...(option.id === open.highlighted ? { focused: true } : {}),
          ...(option.description === undefined ? {} : { description: option.description }),
          ...(option.disabled ? { disabled: true } : {}),
        })),
      }],
    }),
  };
}

function selectActionForList(action: ListAction): SelectAction {
  switch (action.kind) {
    case 'select':
    case 'activate':
      return { kind: 'commit', id: action.id };
    case 'move':
      return action;
    case 'page':
      return { kind: 'move', delta: action.delta };
    case 'first':
      return action;
    case 'last':
      return action;
    case 'scroll':
      return action;
  }
}

function selectPopupStyles(
  styles: import('../../element/index.ts').ElementStyles<ChoiceStylePart>,
): import('../../element/index.ts').ElementStyles<
  import('../../ui-model/style-parts.ts').DataListStylePart
> {
  return {
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(styles.parts === undefined ? {} : {
      parts: {
        ...(styles.parts.marker === undefined ? {} : { marker: styles.parts.marker }),
        ...(styles.parts.option === undefined ? {} : { item: styles.parts.option }),
        ...(styles.parts.description === undefined
          ? {}
          : { description: styles.parts.description }),
      },
    }),
    ...(styles.states === undefined ? {} : { states: styles.states }),
  };
}

function prepareSelect<TValue, TMessage extends ComponentMessage>(
  value: Readonly<SelectOptions<TValue, TMessage>>,
): SelectModel {
  const label = value.label;
  if (typeof label !== 'string') throw new TypeError('select label must be a string.');
  const rawOptions = value.options;
  if (!Array.isArray(rawOptions)) throw new TypeError('select options must be an array.');
  const ids = new Set<string>();
  const options = rawOptions.map((raw, index): SelectOptionModel => {
    if (!isNonArrayObject(raw)) {
      throw new TypeError(`select options[${String(index)}] must be an object.`);
    }
    const id = raw['id'];
    const optionLabel = raw['label'];
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('select option id must be non-empty.');
    }
    if (ids.has(id)) throw new TypeError(`select contains duplicate option id "${id}".`);
    ids.add(id);
    if (typeof optionLabel !== 'string') {
      throw new TypeError('select option label must be a string.');
    }
    if (raw['description'] !== undefined && typeof raw['description'] !== 'string') {
      throw new TypeError('select option description must be a string.');
    }
    if (raw['disabled'] !== undefined && typeof raw['disabled'] !== 'boolean') {
      throw new TypeError('select option disabled must be a boolean.');
    }
    return {
      id,
      label: sanitizeTerminalText(optionLabel).text,
      ...(raw['description'] === undefined
        ? {}
        : { description: sanitizeTerminalText(raw['description']).text }),
      disabled: raw['disabled'] === true,
    };
  });
  const presentation = prepareSelectPresentation(value.presentation);
  if (value.disabled === true && presentation.kind === 'open') {
    throw new TypeError('select cannot be open while disabled.');
  }
  const choiceOptions = options.map((option): ChoiceItem => ({ ...option, value: option.id }));
  const normalized = normalizeSelectState(presentation, choiceOptions);
  const placeholder = value.placeholder;
  if (placeholder !== undefined && typeof placeholder !== 'string') {
    throw new TypeError('select placeholder must be a string.');
  }
  const placement = value.placement;
  assertOptionalEnum(
    placement,
    ['above', 'below', 'left', 'right', 'auto', 'cursor'],
    'select placement',
  );
  const maxVisibleOptions = value.maxVisibleOptions;
  if (
    maxVisibleOptions !== undefined &&
    (typeof maxVisibleOptions !== 'number' ||
      !Number.isSafeInteger(maxVisibleOptions) ||
      maxVisibleOptions < 1)
  ) {
    throw new RangeError('select maxVisibleOptions must be a positive safe integer.');
  }
  for (const field of ['required'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`select ${field} must be a boolean.`);
    }
  }
  const error = value.error;
  if (error !== undefined && typeof error !== 'string') {
    throw new TypeError('select error must be a string.');
  }
  const pointerState = value.pointerState;
  if (pointerState !== undefined) assertPointerState(pointerState);
  const scrollbar = prepareScrollbar(value.scrollbar);
  return {
    label: sanitizeTerminalText(label).text,
    options,
    presentation: normalized,
    placeholder: sanitizeTerminalText(placeholder ?? 'Select…').text,
    placement: placement ?? 'auto',
    maxVisibleOptions: maxVisibleOptions ?? 8,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    required: value.required === true,
    ...(error === undefined ? {} : { error: sanitizeTerminalText(error).text }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareSelectPresentation(value: SelectPresentation): SelectPresentation {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['open', 'closed'])) {
    throw new TypeError('select presentation is invalid.');
  }
  if (value.selected !== undefined && typeof value.selected !== 'string') {
    throw new TypeError('select presentation selected must be a string.');
  }
  const selected = value.selected;
  if (value.kind === 'closed') {
    return { kind: 'closed', ...(typeof selected === 'string' ? { selected } : {}) };
  }
  if (value.highlighted !== undefined && typeof value.highlighted !== 'string') {
    throw new TypeError('select presentation highlighted must be a string.');
  }
  const highlighted = value.highlighted;
  const scroll = prepareScrollState(value.scroll, 'select presentation scroll');
  return {
    kind: 'open',
    ...(typeof selected === 'string' ? { selected } : {}),
    ...(typeof highlighted === 'string' ? { highlighted } : {}),
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function prepareScrollState(value: ScrollState | undefined, label: string): ScrollState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  const required = [
    'offsetRow',
    'offsetColumn',
    'contentRows',
    'contentColumns',
    'viewportRows',
    'viewportColumns',
  ] as const;
  for (const field of required) {
    const member = value[field];
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${label}.${field} must be a non-negative safe integer.`);
    }
  }
  if (typeof value.followTail !== 'boolean') {
    throw new TypeError(`${label}.followTail must be a boolean.`);
  }
  const selectedIndex = value.selectedIndex;
  if (
    selectedIndex !== undefined &&
    (typeof selectedIndex !== 'number' || !Number.isSafeInteger(selectedIndex) || selectedIndex < 0)
  ) {
    throw new RangeError(`${label}.selectedIndex must be a non-negative safe integer.`);
  }
  const offsetRow = value.offsetRow;
  const offsetColumn = value.offsetColumn;
  const contentRows = value.contentRows;
  const contentColumns = value.contentColumns;
  const viewportRows = value.viewportRows;
  const viewportColumns = value.viewportColumns;
  if (
    typeof offsetRow !== 'number' ||
    typeof offsetColumn !== 'number' ||
    typeof contentRows !== 'number' ||
    typeof contentColumns !== 'number' ||
    typeof viewportRows !== 'number' ||
    typeof viewportColumns !== 'number'
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return {
    offsetRow,
    offsetColumn,
    contentRows,
    contentColumns,
    viewportRows,
    viewportColumns,
    followTail: value.followTail,
    ...(typeof selectedIndex === 'number' ? { selectedIndex } : {}),
  };
}

function prepareScrollbar(value: ScrollbarOptions | undefined): ScrollbarOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('select scrollbar must be an object.');
  const visible = value['visible'];
  const axis = value['axis'];
  const visualState = value['visualState'];
  if (visible !== undefined && visible !== 'auto' && visible !== 'always' && visible !== 'never') {
    throw new TypeError('select scrollbar visible is invalid.');
  }
  if (axis !== undefined && axis !== 'vertical' && axis !== 'horizontal' && axis !== 'both') {
    throw new TypeError('select scrollbar axis is invalid.');
  }
  if (
    visualState !== undefined &&
    visualState !== 'idle' &&
    visualState !== 'active' &&
    visualState !== 'hover' &&
    visualState !== 'disabled' &&
    visualState !== 'inactive'
  ) {
    throw new TypeError('select scrollbar visualState is invalid.');
  }
  return {
    ...(visible === undefined ? {} : { visible }),
    ...(axis === undefined ? {} : { axis }),
    ...(visualState === undefined ? {} : { visualState }),
  };
}
