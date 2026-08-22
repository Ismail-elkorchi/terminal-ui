import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  mapComponentStyles,
  measureConstrainedBox,
  measureRenderSpans,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentLayoutInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { Element, ElementChildrenMessage } from '../../element/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type {
  ButtonOptions,
  CheckboxOptions,
  ActiveComboboxOptions,
  ActiveAutocompleteComboboxOptions,
  AutocompleteComboboxOptions,
  AnyComboboxOptions,
  ComboboxOptions,
  FieldOptions,
  FormOptions,
  LabelOptions,
  SwitchOptions,
  ScrollableComboboxOptions,
  UnscrolledComboboxOptions,
} from '../options/forms.ts';
import { inlineSegmentText, normalizeInlineContent } from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import { createTerminalTextIndex, measureTextCells, oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type {
  ButtonAction,
  ButtonTone,
  CheckboxAction,
  SwitchAction,
} from '../../ui-model/forms.ts';
import type { ButtonStylePart } from '../../ui-model/style-parts.ts';
import type {
  ChoiceStylePart,
  ComboboxStylePart,
  FieldStylePart,
  LabelStylePart,
} from '../../ui-model/style-parts.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import { allowsComponentAction } from '../internal/action-capability.ts';
import { inspectTextValue, inspectValidation } from '../internal/inspection.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import {
  pointerVisualState,
} from '../../interaction/pointer-interaction.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { LayoutFlowOptions, Rect } from '../../geometry/types.ts';
import {
  layoutContentBounds,
  normalizeLayoutFlowOptions,
  splitTracks,
} from '../../layout/index.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type {
  AnyComboboxPresentation,
  AutocompleteComboboxTransition,
  ComboboxCommitEvent,
  ScrollableComboboxPresentation,
  ComboboxTransition,
} from '../../ui-model/combobox.ts';
import type { ListboxTransition } from '../../ui-model/list.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import {
  popupActiveDescendantId,
  popupAllowsDismissal,
  popupRelationship,
  standardPopupDismissal,
} from '../../interaction/popup.ts';
import { ownSelectionState } from '../../interaction/collection.ts';
import { portal, surface } from '../../layout/index.ts';
import { listbox } from './list.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';
import { textPointerTarget } from '../internal/text-pointer-target.ts';
import {
  prepareSingleLineTextWindow,
} from '../internal/single-line-text-window.ts';
import type { SingleLineTextWindow } from '../internal/single-line-text-window.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import { isIgnoredMessage } from '../../interaction/message.ts';

interface FormModel {
  readonly title: string;
  readonly layout: LayoutFlowOptions;
}

type FormOwnOptions = LayoutFlowOptions & Pick<FormOptions, 'title'>;

type FormFactory = <
  const TContent extends readonly Element<ComponentMessage>[] = readonly Element<ComponentMessage>[],
>(options: FormOptions<TContent>) => Element<ElementChildrenMessage<TContent>>;

const formSlots = {
  content: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

export const form: FormFactory = defineComponent<
  FormOwnOptions,
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
  accessibleRole: 'form',
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
    const titleRows = input.model.title.length === 0 ? 0 : 1;
    return measureConstrainedBox({
      minWidth: Math.max(titleWidth, ...measurements.map((item) => item.minWidth), 0),
      minHeight: titleRows + measurements.reduce((height, item) => height + item.minHeight, 0) +
        Math.max(0, count - 1) * gap,
      preferredWidth: Math.max(titleWidth, ...measurements.map((item) => item.preferredWidth), 0) +
        0,
      preferredHeight: titleRows +
        measurements.reduce((height, item) => height + item.preferredHeight, 0) +
        Math.max(0, count - 1) * gap,
    }, input.model.layout);
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
      ...(input.model.title === '' ? {} : { label: input.model.title }),
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

function prepareForm(value: Readonly<FormOwnOptions>): FormModel {
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
  control: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
} as const;

type FieldFactory = <TChild extends Element<ComponentMessage>>(
  options: FieldOptions<TChild>,
) => Element<import('../../element/index.ts').ElementMessage<TChild>>;

const instantiateField = defineComponent<
  { readonly label: string; readonly description?: string } & LayoutFlowOptions,
  FieldModel,
  never,
  FieldStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer'],
  typeof fieldSlots
>({
  name: 'terminal-ui/components/field',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
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
      input.slots.measure('control').preferredWidth,
      0,
    );
    const height = header.length + input.slots.measure('control').preferredHeight;
    const control = input.slots.measure('control');
    return measureConstrainedBox({
      minWidth: control.minWidth,
      minHeight: header.length + control.minHeight,
      preferredWidth: width,
      preferredHeight: height,
      ...(control.maxWidth === undefined ? {} : { maxWidth: control.maxWidth }),
      ...(control.maxHeight === undefined ? {} : { maxHeight: header.length + control.maxHeight }),
    }, input.model.layout);
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
    return {
      control: childBounds,
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
    const control = input.slots.control[0];
    if (control === undefined) {
      throw new Error('field accessibility requires its control slot.');
    }
    const labelId = `${input.id}:label`;
    const descriptionId = `${input.id}:description`;
    const describedBy = input.model.description.length === 0
      ? control.describedBy
      : [...(control.describedBy ?? []), descriptionId];
    const relatedControl: AccessibleNode = {
      ...control,
      labelledBy: labelId,
      ...(describedBy === undefined ? {} : { describedBy }),
    };
    return {
      id: input.id,
      role: 'group',
      labelledBy: labelId,
      ...(input.focused ? { focused: true } : {}),
      children: [
        {
          id: labelId,
          role: 'text',
          value: input.model.label,
          controls: control.id,
        },
        ...(input.model.description.length === 0 ? [] : [{
          id: descriptionId,
          role: 'text' as const,
          value: input.model.description,
        }]),
        relatedControl,
      ],
    };
  },
});

export const field: FieldFactory = (options) => {
  const { control, ...rest } = options;
  return instantiateField({ ...rest, slots: { control } });
};

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
  LabelStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<LabelOptions, 'text' | 'forId'>,
  LabelModel,
  never,
  LabelStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/label',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  metadata: ['styles', 'layer'],
  parts: ['label'],
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
    return {
      id,
      role: 'text',
      ...(model.text === '' ? {} : { label: model.text }),
      controls: model.forId,
    };
  },
});

interface ButtonModel {
  readonly label: string;
  readonly accessibleName: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone: ButtonTone;
  readonly density: ComponentDensity;
  readonly pressed?: boolean;
}

export interface ButtonOwnOptions {
  readonly label?: string;
  readonly accessibleName?: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly pressed?: boolean;
}

type ButtonComponentAction = ButtonAction;

type ButtonFactory = <const TMessage extends ComponentMessage = never>(
  options: ButtonOptions<TMessage>,
) => Element<TMessage>;

type ActionButtonComponentFactory = SemanticLeafComponentFactory<
  ButtonOwnOptions,
  ButtonComponentAction,
  ButtonStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['styles', 'layer', 'focus'],
  readonly ['focused', 'hovered', 'pressed', 'disabled', 'busy']
>;

const instantiateButton = defineActionButtonComponent('terminal-ui/components/button');
export const instantiateToggleButton = defineActionButtonComponent('terminal-ui/components/toggle-button');

function defineActionButtonComponent(name: `${string}/${string}`): ActionButtonComponentFactory {
  return defineComponent<
  ButtonOwnOptions,
  ButtonModel,
  ButtonComponentAction,
  ButtonStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['styles', 'layer', 'focus'],
  readonly ['focused', 'hovered', 'pressed', 'disabled', 'busy']
>({
  name,
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'button',
  states: ['disabled', 'busy', 'inert'],
  metadata: ['styles', 'layer', 'focus'],
  parts: ['frame', 'marker', 'leading', 'label', 'trailing'],
  visualStates: ['focused', 'hovered', 'pressed', 'disabled', 'busy'],
  prepare(value) {
    const label = value.label ?? '';
    const accessibleName = value.accessibleName ?? label;
    const leading = value.leading;
    const trailing = value.trailing;
    const tone = value.tone;
    const density = value.density;
    const pressed = value.pressed;
    if (typeof label !== 'string') throw new TypeError('button label must be a string.');
    if (typeof accessibleName !== 'string' || sanitizeTerminalText(accessibleName).text.trim() === '') {
      throw new TypeError('button accessibleName must be a non-empty string.');
    }
    if (label === '' && leading === undefined && trailing === undefined) {
      throw new TypeError('an icon-only button requires leading or trailing content.');
    }
    if (tone !== undefined && !isButtonTone(tone)) throw new TypeError('button tone is invalid.');
    assertOptionalEnum(density, ['compact', 'regular'], 'button density');
    if (pressed !== undefined && typeof pressed !== 'boolean') {
      throw new TypeError('button pressed must be a boolean.');
    }
    return {
      label: sanitizeTerminalText(label).text,
      accessibleName: sanitizeTerminalText(accessibleName).text,
      ...(leading === undefined
        ? {}
        : { leading: normalizeInlineContent(leading) }),
      ...(trailing === undefined
        ? {}
        : { trailing: normalizeInlineContent(trailing) }),
      tone: tone ?? 'default',
      density: density ?? 'regular',
      ...(pressed === undefined ? {} : { pressed }),
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
    const visualStates = buttonVisualStates(input, input.focus === 'self');
    const frameStyle = input.style({
      part: 'frame',
      ...(visualStates.length === 0 ? {} : { states: visualStates }),
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
      label: model.accessibleName,
      ...(model.pressed === undefined ? {} : { pressed: model.pressed }),
      ...(busy ? { description: 'Busy.' } : {}),
      ...(focused ? { focused: true } : {}),
    };
  },
  });
}

export const button: ButtonFactory = (options) => {
  const own = {
    id: options.id,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.accessibleName === undefined ? {} : { accessibleName: options.accessibleName }),
    ...(options.leading === undefined ? {} : { leading: options.leading }),
    ...(options.trailing === undefined ? {} : { trailing: options.trailing }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    ...(options.density === undefined ? {} : { density: options.density }),
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateButton({ ...own, disabled: true });
  assertActionCallbacks(options, 'button');
  return instantiateButton({
    ...own,
    onAction: options.onAction,
  });
};

type ButtonVisualInput =
  | ComponentMeasureInput<ButtonModel>
  | ComponentRenderInput<ButtonModel, ButtonStylePart>;

function buttonSpans(input: ButtonVisualInput, focused: boolean): readonly RenderSpan[] {
  const states = buttonVisualStates(input, focused);
  const state = states.at(-1);
  const frameStyle = resolveButtonStyle(
    input,
    'frame',
    buttonToneStyle(input.model.tone, true, input.busy),
    states,
  );
  const labelStyle = resolveButtonStyle(
    input,
    'label',
    buttonToneStyle(input.model.tone, false, input.busy),
    states,
  );
  const compact = input.model.density === 'compact';
  const targetId = `${input.id ?? 'button'}:control`;
  const pointerState = pointerVisualState(input.pointerState, targetId);
  const marker = oneCellGlyph(
    input.busy
      ? input.theme.tokens.symbols.statusInfo
      : pointerState === 'pressed'
      ? input.theme.tokens.symbols.selected
      : input.model.pressed === true
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
    spans.push(...buttonInlineSpans(input, input.model.leading, 'leading', labelStyle, states));
    spans.push(componentSpan(input, ' ', 'frame', 'separator.leading', frameStyle, state));
  }
  spans.push(
    ...(input.model.label === ''
      ? []
      : [componentSpan(input, input.model.label, 'label', 'label.text', labelStyle, state)]),
  );
  if (input.model.trailing !== undefined) {
    spans.push(componentSpan(input, ' ', 'frame', 'separator.trailing', frameStyle, state));
    spans.push(...buttonInlineSpans(input, input.model.trailing, 'trailing', labelStyle, states));
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
  states: readonly Exclude<ElementVisualState, 'default'>[],
): readonly RenderSpan[] {
  const state = states.at(-1);
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
      states,
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
  states: readonly Exclude<ElementVisualState, 'default'>[],
): TerminalStyle | undefined {
  const state = states.at(-1);
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
      ...(states.length === 0 ? {} : { states }),
    })
    : resolvedBase;
}

function buttonVisualStates(
  input: ButtonVisualInput,
  focused: boolean,
): readonly Exclude<ElementVisualState, 'default'>[] {
  if (input.disabled) return ['disabled'];
  const pointer = pointerVisualState(input.pointerState, `${input.id ?? 'button'}:control`);
  return [
    ...(focused ? ['focused' as const] : []),
    ...(input.busy ? ['busy' as const] : []),
    ...(pointer === undefined ? [] : [pointer]),
  ];
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
}

type CheckboxComponentAction = CheckboxAction;

type CheckboxFactory = <const TMessage extends ComponentMessage = never>(
  options: CheckboxOptions<TMessage>,
) => Element<TMessage>;

const instantiateCheckbox: SemanticLeafComponentFactory<
  Pick<CheckboxOptions<ComponentMessage>, 'label' | 'checked' | 'required' | 'error'>,
  CheckboxComponentAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'disabled']
> = defineComponent<
  Pick<CheckboxOptions<ComponentMessage>, 'label' | 'checked' | 'required' | 'error'>,
  CheckboxModel,
  CheckboxComponentAction,
  ChoiceStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'disabled']
>({
  name: 'terminal-ui/components/checkbox',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'checkbox',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'marker', 'option', 'description', 'error'],
  visualStates: ['focused', 'hovered', 'pressed', 'disabled'],
  prepare(value) {
    const label = value.label;
    const checked = value.checked;
    const required = value.required;
    const error = value.error;
    if (typeof label !== 'string') throw new TypeError('checkbox label must be a string.');
    if (typeof checked !== 'boolean') throw new TypeError('checkbox checked must be a boolean.');
    if (required !== undefined && typeof required !== 'boolean') {
      throw new TypeError('checkbox required must be a boolean.');
    }
    if (error !== undefined && typeof error !== 'string') {
      throw new TypeError('checkbox error must be a string.');
    }
    return {
      label: sanitizeTerminalText(label).text,
      checked,
      required: required === true,
      error: error === undefined ? '' : sanitizeTerminalText(error).text,
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
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds }) => [{
    id: `${id ?? 'checkbox'}:control`,
    bounds,
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'change', checked: !model.checked }),
  }],
  accessibility({ id, model, focused }) {
    const description = [model.required ? 'Required.' : '', model.error]
      .filter((value) => value.length > 0).join(' ');
    return {
      id,
      role: 'checkbox',
      ...(model.label === '' ? {} : { label: model.label }),
      checked: model.checked,
      required: model.required,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(description.length === 0 ? {} : { description }),
      ...(focused ? { focused: true } : {}),
    };
  },
});

export const checkbox: CheckboxFactory = (options) => {
  const own = {
    id: options.id,
    label: options.label,
    checked: options.checked,
    ...(options.required === undefined ? {} : { required: options.required }),
    ...(options.error === undefined ? {} : { error: options.error }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateCheckbox({ ...own, disabled: true });
  assertActionCallbacks(options, 'checkbox');
  return instantiateCheckbox({
    ...own,
    onAction: options.onAction,
  });
};

interface ToggleModel {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel: string;
  readonly offLabel: string;
  readonly error: string;
}

type SwitchComponentAction = SwitchAction;

type SwitchFactory = <const TMessage extends ComponentMessage = never>(
  options: SwitchOptions<TMessage>,
) => Element<TMessage>;

const instantiateSwitch: SemanticLeafComponentFactory<
  Pick<
    SwitchOptions<ComponentMessage>,
    'label' | 'checked' | 'onLabel' | 'offLabel' | 'error'
  >,
  SwitchComponentAction,
  import('../../ui-model/style-parts.ts').ToggleStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'disabled']
> = defineComponent<
  Pick<
    SwitchOptions<ComponentMessage>,
    'label' | 'checked' | 'onLabel' | 'offLabel' | 'error'
  >,
  ToggleModel,
  SwitchComponentAction,
  import('../../ui-model/style-parts.ts').ToggleStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'disabled']
>({
  name: 'terminal-ui/components/switch',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'switch',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'track', 'handle', 'onLabel', 'offLabel', 'error'],
  visualStates: ['focused', 'hovered', 'pressed', 'disabled'],
  prepare(value) {
    const label = value.label;
    const checked = value.checked;
    const onLabel = value.onLabel;
    const offLabel = value.offLabel;
    const error = value.error;
    if (typeof label !== 'string') throw new TypeError('switchControl label must be a string.');
    if (typeof checked !== 'boolean') {
      throw new TypeError('switchControl checked must be a boolean.');
    }
    if (onLabel !== undefined && typeof onLabel !== 'string') {
      throw new TypeError('switchControl onLabel must be a string.');
    }
    if (offLabel !== undefined && typeof offLabel !== 'string') {
      throw new TypeError('switchControl offLabel must be a string.');
    }
    if (error !== undefined && typeof error !== 'string') {
      throw new TypeError('switchControl error must be a string.');
    }
    return {
      label: sanitizeTerminalText(label).text,
      checked,
      onLabel: onLabel === undefined ? 'On' : sanitizeTerminalText(onLabel).text,
      offLabel: offLabel === undefined ? 'Off' : sanitizeTerminalText(offLabel).text,
      error: error === undefined ? '' : sanitizeTerminalText(error).text,
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
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds }) => [{
    id: `${id ?? 'switchControl'}:control`,
    bounds,
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'change', checked: !model.checked }),
  }],
  accessibility({ id, model, focused }) {
    return {
      id,
      role: 'switch',
      ...(model.label === '' ? {} : { label: model.label }),
      value: model.checked ? model.onLabel : model.offLabel,
      checked: model.checked,
      invalid: model.error !== '',
      ...(model.error.length === 0 ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(focused ? { focused: true } : {}),
    };
  },
});

export const switchControl: SwitchFactory = (options) => {
  const own = {
    id: options.id,
    label: options.label,
    checked: options.checked,
    ...(options.onLabel === undefined ? {} : { onLabel: options.onLabel }),
    ...(options.offLabel === undefined ? {} : { offLabel: options.offLabel }),
    ...(options.error === undefined ? {} : { error: options.error }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateSwitch({ ...own, disabled: true });
  assertActionCallbacks(options, 'switchControl');
  return instantiateSwitch({
    ...own,
    onAction: options.onAction,
  });
};

interface ControlVisualInput<TModel extends object, TPart extends string> {
  readonly id?: string;
  readonly model: TModel;
  readonly disabled: boolean;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly focus?: import('../../renderer/index.ts').RenderFocusRelation;
  readonly pointerState?: PointerInteractionState;
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
  const states = controlVisualStates(input, `${input.id ?? 'checkbox'}:control`);
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
      states,
      decorated,
      input.model.checked
        ? { fg: { kind: 'theme', token: 'accent.primary' }, bold: true }
        : undefined,
    ),
    controlVisualSpan(input, ' ', 'option', 'separator', states, decorated),
    controlVisualSpan(
      input,
      label,
      'label',
      input.model.required ? 'label.required' : 'label.text',
      states,
      decorated,
    ),
  ], ...controlErrorLine(input, input.model.error, 'error', states, decorated)];
}

function toggleLines(
  input: ControlVisualInput<ToggleModel, import('../../ui-model/style-parts.ts').ToggleStylePart>,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const states = controlVisualStates(input, `${input.id ?? 'switchControl'}:control`);
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
      controlVisualSpan(input, `${input.model.label}: `, 'label', 'label.text', states, decorated),
    ]),
    controlVisualSpan(
      input,
      input.model.checked ? `${track}${thumb}` : `${thumb}${track}`,
      'track',
      'switch.track',
      states,
      decorated,
      trackStyle,
    ),
    controlVisualSpan(input, ' ', 'track', 'separator', states, decorated),
    controlVisualSpan(
      input,
      input.model.checked ? input.model.onLabel : input.model.offLabel,
      valuePart,
      input.model.checked ? 'value.on' : 'value.off',
      states,
      decorated,
      trackStyle,
    ),
  ], ...controlErrorLine(input, input.model.error, 'error', states, decorated)];
}

function controlErrorLine<TModel extends object, TPart extends string>(
  input: ControlVisualInput<TModel, TPart>,
  error: string,
  part: TPart,
  states: readonly Exclude<ElementVisualState, 'default'>[],
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  return error.length === 0 ? [] : [[controlVisualSpan(
    input,
    error,
    part,
    'validation.error',
    states,
    decorated,
    { fg: { kind: 'theme', token: 'status.error' }, bold: true },
  )]];
}

function controlVisualSpan<TModel extends object, TPart extends string>(
  input: ControlVisualInput<TModel, TPart>,
  textValue: string,
  part: TPart,
  partName: string,
  states: readonly Exclude<ElementVisualState, 'default'>[],
  decorated: boolean,
  base?: TerminalStyle,
): RenderSpan {
  if (!decorated || input.style === undefined || input.source === undefined) {
    return { text: textValue };
  }
  const style = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(states.length === 0 ? {} : { states }),
  });
  const state = states.at(-1);
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

function controlVisualStates<TModel extends object>(
  input: Pick<ControlVisualInput<TModel, string>, 'id' | 'model' | 'disabled' | 'focus' | 'pointerState'>,
  targetId: string,
): readonly Exclude<ElementVisualState, 'default'>[] {
  if (input.disabled) return ['disabled'];
  const pointer = pointerVisualState(input.pointerState, targetId);
  return [
    ...(input.focus === 'self' ? ['focused' as const] : []),
    ...(pointer === undefined ? [] : [pointer]),
  ];
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

interface ComboboxOptionModel {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
}

interface ComboboxModel {
  readonly label: string;
  readonly options: readonly ComboboxOptionModel[];
  readonly presentation: AnyComboboxPresentation;
  readonly placeholder: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleOptions: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly required: boolean;
  readonly error?: string;
}

const comboboxSlots = {
  popup: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

/* eslint-disable @typescript-eslint/unified-signatures -- overloads preserve mode-specific transition inference */
interface ComboboxFactory {
  <TValue, const TMessage extends ComponentMessage = never>(
    options: AutocompleteComboboxOptions<TValue, TMessage>,
  ): Element<TMessage>;
  <TValue, const TMessage extends ComponentMessage = never>(
    options: ScrollableComboboxOptions<TValue, TMessage>,
  ): Element<TMessage>;
  <TValue, const TMessage extends ComponentMessage = never>(
    options: UnscrolledComboboxOptions<TValue, TMessage>,
  ): Element<TMessage>;
}
/* eslint-enable @typescript-eslint/unified-signatures */

type ComboboxComponentAction =
  | { readonly kind: 'transition'; readonly transition: AutocompleteComboboxTransition }
  | { readonly kind: 'commit'; readonly event: ComboboxCommitEvent }
  | { readonly kind: 'contextMenu'; readonly event: TextContextMenuEvent };

const instantiateCombobox = defineComponent<
  ComboboxModel,
  ComboboxModel,
  ComboboxComponentAction,
  ComboboxStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof comboboxSlots,
  readonly ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy', 'readOnly']
>({
  name: 'terminal-ui/components/combobox',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'combobox',
  slots: comboboxSlots,
  states: ['disabled', 'busy', 'readOnly', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'label',
    'marker',
    'option',
    'description',
    'value',
    'placeholder',
    'selection',
    'cursor',
    'error',
  ],
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy', 'readOnly'],
  inspection: ({ model }) => {
    const activeId = comboboxActiveId(model.presentation);
    const selectedId = comboboxSelectedId(model.presentation);
    return {
      value: model.presentation.kind === 'autocomplete'
        ? inspectTextValue(model.presentation.input.text)
        : null,
      ...(activeId === undefined ? {} : { active: activeId }),
      selection: {
        mode: 'single',
        ...(selectedId === undefined ? {} : { selectedId }),
      },
      ...(model.presentation.kind === 'autocomplete'
        ? { details: {
          caretOffset: model.presentation.input.cursor,
          ...(model.presentation.input.selection === undefined
            ? {}
            : { textSelection: {
              startOffset: model.presentation.input.selection.startOffset,
              endOffsetExclusive: model.presentation.input.selection.endOffsetExclusive,
            } }),
        } }
        : {}),
      validation: inspectValidation(model.required, model.error),
      collection: {
        startIndex: 0,
        totalCount: model.options.length,
        visibleCount: model.options.length,
      },
    };
  },
  implementationSlots(input) {
    if (!input.model.presentation.open) return { popup: undefined };
    const id = input.id ?? 'combobox';
    const highlighted = comboboxActiveId(input.model.presentation);
    const selectedId = comboboxSelectedId(input.model.presentation);
    const common = {
      id: `${id}:popup:list`,
      items: input.model.options,
      projectItem: (option: ComboboxOptionModel) => option,
      ...(input.styles === undefined ? {} : { styles: comboboxPopupStyles(input.styles) }),
      meta: {
        focus: { disabled: true },
      },
    };
    const scroll = comboboxScroll(input.model.presentation);
    const popupList = scroll === undefined
      ? listbox<ComboboxOptionModel, ComponentMessage>({
        ...common,
        presentation: {
          ...(highlighted === undefined ? {} : { activeId: highlighted }),
          selection: selectedId === undefined
            ? { mode: 'single' as const }
            : { mode: 'single' as const, selectedId },
        },
        onTransition: (action) => input.emit(comboboxTransitionForListbox(action)),
        onActivate: (event) => !allowsComponentAction(input, 'commitSelection')
          ? ignoreMessage()
          : input.emit({ kind: 'commit', event: { kind: 'commit', id: event.id } }),
      })
      : listbox<ComboboxOptionModel, ComponentMessage>({
        ...common,
        presentation: {
          ...(highlighted === undefined ? {} : { activeId: highlighted }),
          selection: selectedId === undefined
            ? { mode: 'single' as const }
            : { mode: 'single' as const, selectedId },
          scroll,
        },
        ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
        onTransition: (action) => input.emit(comboboxTransitionForListbox(action)),
        onActivate: (event) => !allowsComponentAction(input, 'commitSelection')
          ? ignoreMessage()
          : input.emit({ kind: 'commit', event: { kind: 'commit', id: event.id } }),
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
          onOutsidePress: () => input.emit(comboboxComponentTransition({
            kind: 'dismiss',
            reason: 'outsidePress',
          })),
          meta: { layer: { zIndex: 20, underlay: 'clear' } },
        },
      ),
    };
  },
  measure(input) {
    const selected = selectedComboboxOption(input.model);
    const value = input.model.presentation.kind === 'autocomplete'
      ? input.model.presentation.input.text || input.model.placeholder
      : selected?.label ?? input.model.placeholder;
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
    renderCombobox(input);
  },
  keys({ id, model, busy, readOnly }) {
    const availability = { busy, readOnly };
    if (!allowsComponentAction(availability, 'navigate')) return {};
    const canEdit = allowsComponentAction(availability, 'edit');
    const canCommitSelection = allowsComponentAction(availability, 'commitSelection');
    const whenSelf =
      (action: import('../../interaction/index.ts').MessageResolution<ComboboxComponentAction>) =>
      (event: { readonly focusPath: readonly string[] }) =>
        event.focusPath.at(-1) === id ? action : ignoreMessage();
    const highlighted = model.presentation.open
      ? comboboxActiveId(model.presentation)
      : undefined;
    const triggers = model.presentation.kind !== 'autocomplete'
      ? undefined
      : [
          ...textEditingTriggers(!canEdit, false).map((binding) => ({
            trigger: binding.trigger,
            onKey: (event: Parameters<typeof binding.onKey>[0]) => {
              if (event.focusPath.at(-1) !== id) return ignoreMessage();
              const action = binding.onKey(event);
              return isIgnoredMessage(action)
                ? action
                : comboboxComponentTransition(action);
            },
          })),
          ...(canEdit ? [{
            trigger: { kind: 'key' as const, key: 'z' as const, modifiers: { ctrl: true } },
            onKey: () => comboboxComponentTransition({ kind: 'undo' as const }),
          }, {
            trigger: { kind: 'key' as const, key: 'y' as const, modifiers: { ctrl: true } },
            onKey: () => comboboxComponentTransition({ kind: 'redo' as const }),
          }] : []),
        ];
    return {
      ...(triggers === undefined ? {} : { triggers }),
      arrowDown: whenSelf(comboboxComponentTransition({ kind: 'moveActive', delta: 1 })),
      arrowUp: whenSelf(comboboxComponentTransition({ kind: 'moveActive', delta: -1 })),
      pageDown: whenSelf(comboboxComponentTransition({ kind: 'pageActive', delta: 1 })),
      pageUp: whenSelf(comboboxComponentTransition({ kind: 'pageActive', delta: -1 })),
      ...(model.presentation.kind === 'select'
        ? {
            home: whenSelf(comboboxComponentTransition({ kind: 'firstActive' })),
            end: whenSelf(comboboxComponentTransition({ kind: 'lastActive' })),
            space: whenSelf(comboboxComponentTransition({ kind: 'toggle' })),
          }
        : {}),
      enter: whenSelf(
        !model.presentation.open
          ? comboboxComponentTransition({ kind: 'open' })
        : highlighted === undefined
          ? ignoreMessage()
          : !canCommitSelection ? ignoreMessage() : {
            kind: 'commit',
            event: { kind: 'commit', id: highlighted },
          },
      ),
      escape: whenSelf(
        model.presentation.open && popupAllowsDismissal(standardPopupDismissal, 'escape')
          ? comboboxComponentTransition({ kind: 'dismiss', reason: 'escape' })
          : ignoreMessage(),
      ),
    };
  },
  onInput: ({ model, text, readOnly }) => model.presentation.kind === 'select'
    || !allowsComponentAction({ readOnly }, 'edit')
    ? ignoreMessage()
    : comboboxComponentTransition({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ model, text, readOnly }) => model.presentation.kind === 'select'
    || !allowsComponentAction({ readOnly }, 'edit')
    ? ignoreMessage()
    : comboboxComponentTransition({ kind: 'edit', operation: { kind: 'insert', text } }),
  onFocus: (event, { model }) => event.kind === 'focusLeave'
    && model.presentation.open
    && popupAllowsDismissal(standardPopupDismissal, 'focusLoss')
    ? comboboxComponentTransition({ kind: 'dismiss', reason: 'focusLoss' })
    : ignoreMessage(),
  focusTargets(input) {
    const { bounds, model, widthProfile } = input;
    if (model.presentation.kind === 'select') return [{ id: 'self', bounds }];
    const visual = autocompleteComboboxInputVisual(
      model,
      model.presentation,
      bounds.width,
      widthProfile,
    );
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
      bounds,
      cursor: {
        row: 0,
        column: Math.min(
          Math.max(0, bounds.width - 1),
          visual.labelCells + visual.window.cursorColumn,
        ),
        ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
        source: input.source({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
      },
    }];
  },
  hitTargets(input) {
    const { id, bounds, model, busy } = input;
    if (busy) return [];
    const targetBounds = { ...bounds, height: Math.min(1, bounds.height) };
    if (model.presentation.kind === 'select') {
      return [{
        id: popupRelationship(id ?? 'combobox').triggerId,
        bounds: targetBounds,
        accepts: ['click'],
        focus: { kind: 'target', targetId: 'self' },
        message: () => comboboxComponentTransition({ kind: 'toggle' }),
        cursor: 'pointer',
        ...(model.presentation.open ? { zIndex: 21 } : {}),
      }];
    }
    const index = createTerminalTextIndex(model.presentation.input.text, {
      widthProfile: input.widthProfile,
    });
    const visual = autocompleteComboboxInputVisual(
      model,
      model.presentation,
      input.bounds.width,
      input.widthProfile,
    );
    return [textPointerTarget<ComboboxComponentAction>({
      id: popupRelationship(id ?? 'combobox').triggerId,
      bounds: targetBounds,
      ...(model.presentation.input.selection === undefined
        ? {}
        : { selection: model.presentation.input.selection }),
      focusTargetId: 'self',
      offsetAt(event, origin) {
        const local = origin === 'press'
          ? event.pressLocalColumn ?? event.localColumn ?? 1
          : event.localColumn ?? 1;
        const column = visual.window.offsetCells + Math.max(
          0,
          local - 1 - visual.labelCells - Number(visual.window.clippedBefore),
        );
        return index.graphemeIndexToCodeUnitOffset(index.visualColumnToGraphemeIndex(column));
      },
      wordSelectionAt: (offset) => index.wordSelectionAt(offset),
      onPointer: (action) => comboboxComponentTransition({ kind: 'pointer', action }),
      onContextMenu: (event) => ({ kind: 'contextMenu', event }),
    })];
  },
  accessibility(input) {
    return comboboxAccessibility(input);
  },
});

export const combobox: ComboboxFactory = (options) => {
  return isAutocompleteComboboxOptions(options)
    ? createAutocompleteCombobox(options)
    : createSelectCombobox(options);
};

function isAutocompleteComboboxOptions<TValue, TMessage extends ComponentMessage>(
  options: AnyComboboxOptions<TValue, TMessage>,
): options is AutocompleteComboboxOptions<TValue, TMessage> {
  return options.presentation.kind === 'autocomplete';
}

function createSelectCombobox<TValue, TMessage extends ComponentMessage>(
  options: ComboboxOptions<TValue, TMessage>,
): Element<TMessage> {
  const model = prepareCombobox(options);
  const common = {
    ...model,
    id: options.id,
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateCombobox({ ...common, disabled: true });
  const shared = {
    ...common,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  };
  if (options.inert === true) return instantiateCombobox({ ...shared, inert: true });
  assertRequiredCallback(options.onTransition, 'combobox onTransition');
  assertOptionalCallback(options.onCommit, 'combobox onCommit');
  return instantiateCombobox({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'transition') return emitComboboxTransition(options, action.transition);
      if (action.kind === 'contextMenu') return ignoreMessage();
      return options.onCommit?.(action.event) ?? ignoreMessage();
    },
  });
}

function createAutocompleteCombobox<TValue, TMessage extends ComponentMessage>(
  options: AutocompleteComboboxOptions<TValue, TMessage>,
): Element<TMessage> {
  const model = prepareCombobox(options);
  const common = {
    ...model,
    id: options.id,
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateCombobox({ ...common, disabled: true });
  const shared = { ...common, ...(options.busy === undefined ? {} : { busy: options.busy }) };
  if (options.inert === true) return instantiateCombobox({ ...shared, inert: true });
  assertRequiredCallback(options.onTransition, 'combobox onTransition');
  assertOptionalCallback(options.onCommit, 'combobox onCommit');
  return instantiateCombobox({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'transition') {
        return emitAutocompleteComboboxTransition(options, action.transition);
      }
      if (action.kind === 'contextMenu') {
        return options.onContextMenu?.(action.event) ?? ignoreMessage();
      }
      return options.onCommit?.(action.event) ?? ignoreMessage();
    },
  });
}

function emitComboboxTransition<TValue, TMessage extends ComponentMessage>(
  options: ActiveComboboxOptions<TValue, TMessage>,
  transition: AutocompleteComboboxTransition,
): import('../../interaction/message.ts').MessageResolution<TMessage> {
  if (isAutocompleteOnlyTransition(transition)) return ignoreMessage();
  if (isScrollableComboboxOptions(options)) return options.onTransition(transition);
  return transition.kind === 'scroll'
    ? ignoreMessage()
    : options.onTransition(transition);
}

function emitAutocompleteComboboxTransition<TValue, TMessage extends ComponentMessage>(
  options: ActiveAutocompleteComboboxOptions<TValue, TMessage>,
  transition: AutocompleteComboboxTransition,
): import('../../interaction/message.ts').MessageResolution<TMessage> {
  if (isScrollableAutocompleteComboboxOptions(options)) return options.onTransition(transition);
  return transition.kind === 'scroll'
    ? ignoreMessage()
    : options.onTransition(transition);
}

function isScrollableAutocompleteComboboxOptions<
  TValue,
  TMessage extends ComponentMessage,
>(
  options: ActiveAutocompleteComboboxOptions<TValue, TMessage>,
): options is ActiveAutocompleteComboboxOptions<TValue, TMessage> & {
  readonly presentation: Extract<AnyComboboxPresentation, { readonly kind: 'autocomplete'; readonly scroll: unknown }>;
  readonly onTransition: (
    transition: AutocompleteComboboxTransition,
  ) => import('../../interaction/message.ts').MessageResolution<TMessage>;
} {
  return options.presentation.scroll !== undefined;
}

function isScrollableComboboxOptions<TValue, TMessage extends ComponentMessage>(
  options: ActiveComboboxOptions<TValue, TMessage>,
): options is ActiveComboboxOptions<TValue, TMessage> & {
  readonly presentation: ScrollableComboboxPresentation;
  readonly onTransition: (
    transition: ComboboxTransition,
  ) => import('../../interaction/message.ts').MessageResolution<TMessage>;
} {
  return options.presentation.scroll !== undefined;
}

function isAutocompleteOnlyTransition(
  transition: AutocompleteComboboxTransition,
): transition is Exclude<AutocompleteComboboxTransition, ComboboxTransition> {
  return transition.kind === 'edit'
    || transition.kind === 'undo'
    || transition.kind === 'redo'
    || transition.kind === 'pointer'
    || transition.kind === 'setText';
}

function assertActionCallbacks(
  options: { readonly onAction?: unknown },
  component: string,
): void {
  assertRequiredCallback(options.onAction, `${component} onAction`);
}

function selectedComboboxOption(model: ComboboxModel): ComboboxOptionModel | undefined {
  return model.options.find((option) => option.id === comboboxSelectedId(model.presentation));
}

interface AutocompleteComboboxInputVisual {
  readonly labelCells: number;
  readonly contentWidth: number;
  readonly window: SingleLineTextWindow;
}

function autocompleteComboboxInputVisual(
  model: ComboboxModel,
  presentation: Extract<AnyComboboxPresentation, { readonly kind: 'autocomplete' }>,
  width: number,
  widthProfile: TextWidthProfile,
): AutocompleteComboboxInputVisual {
  const label = model.required ? `${model.label} *` : model.label;
  const labelCells = measureTextCells(`${label}: `, { widthProfile }).cells;
  const contentWidth = Math.max(0, width - labelCells - 2);
  return {
    labelCells,
    contentWidth,
    window: prepareSingleLineTextWindow(
      presentation.input.text,
      presentation.input.cursor,
      contentWidth,
      widthProfile,
    ),
  };
}

function renderCombobox(input: ComponentRenderInput<ComboboxModel, ComboboxStylePart>): void {
  const selected = selectedComboboxOption(input.model);
  const value = input.model.presentation.kind === 'autocomplete'
    ? input.model.presentation.input.text || input.model.placeholder
    : selected?.label ?? input.model.placeholder;
  const state = input.disabled
    ? 'disabled' as const
    : pointerVisualState(input.pointerState, `${input.id ?? 'combobox'}:trigger`) ??
      (input.focus === 'self' ? 'focused' as const : undefined);
  const label = input.model.required ? `${input.model.label} *` : input.model.label;
  const labelCells = measureTextCells(`${label}: `, { widthProfile: input.widthProfile }).cells;
  const valueWidth = Math.max(0, input.bounds.width - labelCells - 2);
  const labelStyle = input.style({
    part: 'label',
    ...(state === undefined ? {} : { states: [state] }),
    base: { fg: { kind: 'theme', token: 'text.strong' }, bold: true },
  });
  const hasValue = input.model.presentation.kind === 'autocomplete'
    ? input.model.presentation.input.text.length > 0
    : selected !== undefined;
  const valuePart: ComboboxStylePart = input.model.presentation.kind === 'autocomplete'
    ? hasValue ? 'value' : 'placeholder'
    : hasValue ? 'option' : 'description';
  const valueStyle = input.style({
    part: valuePart,
    ...(state === undefined ? {} : { states: [state] }),
    base: !hasValue
      ? { fg: { kind: 'theme', token: 'input.placeholder' } }
      : { fg: { kind: 'theme', token: 'text.default' } },
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(state === undefined ? {} : { states: [state] }),
    base: { fg: { kind: 'theme', token: 'control.foreground' } },
  });
  let valueSpans: readonly RenderSpan[];
  if (input.model.presentation.kind === 'select') {
    valueSpans = clipRenderSpans([comboboxSpan(
        input,
        value,
        valuePart,
        hasValue ? 'value.selected' : 'value.placeholder',
        valueStyle,
      )], valueWidth, { widthProfile: input.widthProfile });
  } else {
    const presentation = input.model.presentation;
    const visual = autocompleteComboboxInputVisual(
      input.model,
      presentation,
      input.bounds.width,
      input.widthProfile,
    );
    valueSpans = !hasValue
      ? clipRenderSpans([comboboxSpan(
        input,
        value,
        valuePart,
        'value.placeholder',
        valueStyle,
      )], visual.contentWidth, { widthProfile: input.widthProfile })
      : [
        ...(visual.window.clippedBefore
          ? [comboboxSpan(input, '‹', 'marker', 'value.window', markerStyle)]
          : []),
        ...comboboxSelectedValueSpans(
          input,
          presentation.input.text,
          presentation.input.selection,
          visual.window,
          valueStyle,
        ),
      ];
  }
  input.target.write(0, 0, [
    comboboxSpan(input, label, 'label', 'label', labelStyle),
    comboboxSpan(input, ': ', 'label', 'label.separator', labelStyle),
    ...valueSpans,
    comboboxSpan(input, ' ', 'marker', 'value.separator', markerStyle),
    comboboxSpan(
      input,
      input.model.presentation.open
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
      comboboxSpan(input, input.model.error, 'error', 'validation.error', errorStyle),
    ]);
  }
}

function comboboxSelectedValueSpans(
  input: ComponentRenderInput<ComboboxModel, ComboboxStylePart>,
  value: string,
  selection: import('../../text/index.ts').TextSelection | undefined,
  window: SingleLineTextWindow,
  valueStyle: TerminalStyle | undefined,
): readonly RenderSpan[] {
  const selectedStyle = input.style({
    part: 'selection',
    states: ['selected'],
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
  });
  return [
    {
      start: window.startOffset,
      end: selection?.startOffset ?? window.endOffsetExclusive,
      selected: false,
    },
    ...(selection === undefined ? [] : [{
      start: selection.startOffset,
      end: selection.endOffsetExclusive,
      selected: true,
    }]),
    {
      start: selection?.endOffsetExclusive ?? window.endOffsetExclusive,
      end: window.endOffsetExclusive,
      selected: false,
    },
  ].flatMap((range) => {
    const start = Math.max(window.startOffset, range.start);
    const end = Math.min(window.endOffsetExclusive, range.end);
    return end <= start ? [] : [comboboxSpan(
    input,
    value.slice(start, end),
    range.selected ? 'selection' : 'value',
    range.selected ? 'value.selection' : 'value',
    range.selected ? selectedStyle : valueStyle,
    )];
  });
}

function comboboxSpan(
  input: ComponentRenderInput<ComboboxModel, ComboboxStylePart>,
  text: string,
  part: ComboboxStylePart,
  partName: string,
  style: TerminalStyle | undefined,
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: input.source({ partName, partType: part, cellRole: 'text', description: partName }),
  };
}

function comboboxAccessibility(
  input: ComponentAccessibilityInput<ComboboxModel, typeof comboboxSlots>,
): import('../../accessibility/index.ts').AccessibleNode {
  const selected = selectedComboboxOption(input.model);
  const description = [input.model.required ? 'Required.' : '', input.model.error ?? '']
    .filter((part) => part.length > 0)
    .join(' ');
  const open = input.model.presentation.open ? input.model.presentation : undefined;
  const activeId = open === undefined ? undefined : comboboxActiveId(open);
  const relationship = popupRelationship(input.id);
  return {
    id: input.id,
    role: 'combobox',
    label: input.model.label,
    required: input.model.required,
    invalid: input.model.error !== undefined,
    ...(input.model.error === undefined ? {} : { errorMessage: `${input.id}:error` }),
    expanded: input.model.presentation.open,
    ...(open === undefined ? {} : { controls: relationship.popupId }),
    ...(activeId === undefined
      ? {}
      : { activeDescendant: popupActiveDescendantId(relationship, activeId) }),
    ...(input.model.presentation.kind === 'autocomplete'
      ? {
        value: input.model.presentation.input.text,
        textPosition: {
          caretOffset: input.model.presentation.input.cursor,
          ...(input.model.presentation.input.selection === undefined
            ? {}
            : { selection: input.model.presentation.input.selection }),
        },
      }
      : selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(input.focused ? { focused: true } : {}),
    ...(open === undefined ? {
      children: input.model.error === undefined
        ? []
        : [{ id: `${input.id}:error`, role: 'status' as const, label: input.model.error }],
    } : {
      children: [{
        id: relationship.popupId,
        role: 'listbox' as const,
        ...(input.model.label === '' ? {} : { label: `${input.model.label} options` }),
        children: input.model.options.map((option) => ({
          id: `${relationship.popupId}:item:${option.id}`,
          role: 'option' as const,
          label: option.label,
          selected: option.id === comboboxSelectedId(open),
          ...(option.description === undefined ? {} : { description: option.description }),
          ...(option.disabled ? { disabled: true } : {}),
        })),
      }, ...(input.model.error === undefined
        ? []
        : [{ id: `${input.id}:error`, role: 'status' as const, label: input.model.error }])],
    }),
  };
}

function comboboxTransitionForListbox(action: ListboxTransition): ComboboxComponentAction {
  switch (action.kind) {
    case 'setActive':
      return comboboxComponentTransition({ kind: 'setActive', ...(action.id === undefined ? {} : { id: action.id }) });
    case 'moveActive':
      return comboboxComponentTransition({ kind: 'moveActive', delta: action.delta });
    case 'pageActive':
      return comboboxComponentTransition({ kind: 'pageActive', delta: action.delta });
    case 'firstActive':
      return comboboxComponentTransition({ kind: 'firstActive' });
    case 'lastActive':
      return comboboxComponentTransition({ kind: 'lastActive' });
    case 'commitActive':
      return comboboxComponentTransition({ kind: 'dismiss', reason: 'programmatic' });
    case 'select':
    case 'toggleSelection':
      return { kind: 'commit', event: { kind: 'commit', id: action.id } };
    case 'selectRange':
      return { kind: 'commit', event: { kind: 'commit', id: action.toId } };
    case 'clearSelection':
      return comboboxComponentTransition({ kind: 'dismiss', reason: 'programmatic' });
    case 'scroll':
      return comboboxComponentTransition(action);
  }
}

function comboboxComponentTransition(transition: AutocompleteComboboxTransition): ComboboxComponentAction {
  return { kind: 'transition', transition };
}

function comboboxPopupStyles(
  styles: import('../../element/index.ts').ElementStyles<ComboboxStylePart>,
): import('../../element/index.ts').ElementStyles<
  import('../../ui-model/style-parts.ts').DataListStylePart
> {
  return mapComponentStyles(styles, {
    marker: 'marker',
    item: 'option',
    description: 'description',
  }) ?? {};
}

function prepareCombobox<TValue, TMessage extends ComponentMessage>(
  value: Readonly<AnyComboboxOptions<TValue, TMessage>>,
): ComboboxModel {
  const label = value.label;
  if (typeof label !== 'string') throw new TypeError('combobox label must be a string.');
  const rawOptions = value.options;
  if (!Array.isArray(rawOptions)) throw new TypeError('combobox options must be an array.');
  const ids = new Set<string>();
  const options = rawOptions.map((raw, index): ComboboxOptionModel => {
    if (!isNonArrayObject(raw)) {
      throw new TypeError(`combobox options[${String(index)}] must be an object.`);
    }
    const id = raw['id'];
    const optionLabel = raw['label'];
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('combobox option id must be non-empty.');
    }
    if (ids.has(id)) throw new TypeError(`combobox contains duplicate option id "${id}".`);
    ids.add(id);
    if (typeof optionLabel !== 'string') {
      throw new TypeError('combobox option label must be a string.');
    }
    if (raw['description'] !== undefined && typeof raw['description'] !== 'string') {
      throw new TypeError('combobox option description must be a string.');
    }
    if (raw['disabled'] !== undefined && typeof raw['disabled'] !== 'boolean') {
      throw new TypeError('combobox option disabled must be a boolean.');
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
  const presentation = prepareComboboxPresentation(value.presentation, options);
  if (value.disabled === true && presentation.open) {
    throw new TypeError('combobox cannot be open while disabled.');
  }
  const placeholder = value.placeholder;
  if (placeholder !== undefined && typeof placeholder !== 'string') {
    throw new TypeError('combobox placeholder must be a string.');
  }
  const placement = value.placement;
  assertOptionalEnum(
    placement,
    ['above', 'below', 'left', 'right', 'auto', 'cursor'],
    'combobox placement',
  );
  const maxVisibleOptions = value.maxVisibleOptions;
  if (
    maxVisibleOptions !== undefined &&
    (typeof maxVisibleOptions !== 'number' ||
      !Number.isSafeInteger(maxVisibleOptions) ||
      maxVisibleOptions < 1)
  ) {
    throw new RangeError('combobox maxVisibleOptions must be a positive safe integer.');
  }
  for (const field of ['required'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`combobox ${field} must be a boolean.`);
    }
  }
  const error = value.error;
  if (error !== undefined && typeof error !== 'string') {
    throw new TypeError('combobox error must be a string.');
  }
  const scrollbar = prepareScrollbar(value.scrollbar);
  if (comboboxScroll(presentation) === undefined && scrollbar !== undefined) {
    throw new TypeError('combobox scrollbar requires presentation scroll state.');
  }
  return {
    label: sanitizeTerminalText(label).text,
    options,
    presentation,
    placeholder: sanitizeTerminalText(placeholder ?? 'Select…').text,
    placement: placement ?? 'auto',
    maxVisibleOptions: maxVisibleOptions ?? 8,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    required: value.required === true,
    ...(error === undefined ? {} : { error: sanitizeTerminalText(error).text }),
  };
}

function prepareComboboxPresentation(
  value: AnyComboboxPresentation,
  options: readonly ComboboxOptionModel[],
): AnyComboboxPresentation {
  const candidate: unknown = value;
  if (!isNonArrayObject(candidate) || typeof candidate['open'] !== 'boolean' ||
    (candidate['kind'] !== 'select' && candidate['kind'] !== 'autocomplete')) {
    throw new TypeError('combobox presentation is invalid.');
  }
  if (value.kind === 'autocomplete') {
    if (!isNonArrayObject(value.input) || typeof value.input.text !== 'string' ||
      typeof value.input.cursor !== 'number' || !Number.isSafeInteger(value.input.cursor) ||
      value.input.cursor < 0 || value.input.cursor > value.input.text.length) {
      throw new TypeError('autocomplete combobox input is invalid.');
    }
    const cleanInput = sanitizeTerminalText(value.input.text).text;
    if (cleanInput !== value.input.text) {
      throw new TypeError('autocomplete combobox input must contain sanitized terminal text.');
    }
    const selection = ownSelectionState(value.selection, 'autocomplete combobox selection');
    if (selection.mode !== 'single') {
      throw new TypeError('autocomplete combobox selection must use single mode.');
    }
    const selectedId = selection.selectedId === undefined
      ? undefined
      : nonEmptyId(selection.selectedId, 'autocomplete combobox selectedId');
    const activeId = value.activeId === undefined
      ? undefined
      : nonEmptyId(value.activeId, 'autocomplete combobox activeId');
    if (activeId !== undefined && !options.some((option) => option.id === activeId && !option.disabled)) {
      throw new TypeError('autocomplete combobox activeId must reference an enabled option.');
    }
    const scroll = prepareScrollState(value.scroll, 'autocomplete combobox presentation scroll');
    return {
      kind: 'autocomplete',
      open: value.open,
      input: Object.freeze({
        text: value.input.text,
        cursor: value.input.cursor,
        ...(value.input.selection === undefined
          ? {}
          : { selection: prepareComboboxTextSelection(value.input.selection, value.input.text.length) }),
      }),
      ...(activeId === undefined ? {} : { activeId }),
      selection: Object.freeze({ mode: 'single' as const, ...(selectedId === undefined ? {} : { selectedId }) }),
      ...(scroll === undefined ? {} : { scroll }),
    };
  }
  if (!isNonArrayObject(value.interaction)) {
    throw new TypeError('combobox interaction is invalid.');
  }
  const selection = ownSelectionState(
    value.interaction.selection,
    'combobox interaction selection',
  );
  if (selection.mode !== 'single') {
    throw new TypeError('combobox interaction selection must use single mode.');
  }
  const selectedId = selection.selectedId === undefined
    ? undefined
    : nonEmptyId(selection.selectedId, 'combobox selectedId');
  if (selectedId !== undefined && !options.some((option) => option.id === selectedId)) {
    throw new TypeError('combobox selectedId must reference an option.');
  }
  const activeId = value.interaction.activeId === undefined
    ? undefined
    : nonEmptyId(value.interaction.activeId, 'combobox activeId');
  if (activeId !== undefined && !options.some((option) => option.id === activeId && !option.disabled)) {
    throw new TypeError('combobox activeId must reference an enabled option.');
  }
  const scroll = prepareScrollState(value.scroll, 'combobox presentation scroll');
  return {
    kind: 'select',
    open: value.open,
    interaction: Object.freeze({
      ...(activeId === undefined ? {} : { activeId }),
      selection: Object.freeze({
        mode: 'single' as const,
        ...(selectedId === undefined ? {} : { selectedId }),
      }),
    }),
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function comboboxSelectedId(presentation: AnyComboboxPresentation): string | undefined {
  return presentation.kind === 'autocomplete'
    ? presentation.selection.selectedId
    : presentation.interaction.selection.mode === 'single'
      ? presentation.interaction.selection.selectedId
      : undefined;
}

function comboboxActiveId(presentation: AnyComboboxPresentation): string | undefined {
  return presentation.kind === 'autocomplete'
    ? presentation.activeId
    : presentation.interaction.activeId;
}

function comboboxScroll(presentation: AnyComboboxPresentation): ScrollState | undefined {
  return presentation.scroll;
}

function prepareComboboxTextSelection(
  value: unknown,
  textLength: number,
): import('../../text/index.ts').TextSelection {
  if (!isNonArrayObject(value)) throw new TypeError('autocomplete combobox input selection must be an object.');
  const startOffset = value['startOffset'];
  const endOffsetExclusive = value['endOffsetExclusive'];
  if (typeof startOffset !== 'number' || !Number.isSafeInteger(startOffset) || startOffset < 0 ||
    typeof endOffsetExclusive !== 'number' || !Number.isSafeInteger(endOffsetExclusive) ||
    endOffsetExclusive < startOffset || endOffsetExclusive > textLength) {
    throw new RangeError('autocomplete combobox input selection is outside the input text.');
  }
  return Object.freeze({ startOffset, endOffsetExclusive });
}

function nonEmptyId(value: unknown, owner: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${owner} must be a non-empty string.`);
  }
  return value;
}

function prepareScrollState(value: ScrollState | undefined, label: string): ScrollState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  const required = ['offsetRow', 'offsetColumn'] as const;
  for (const field of required) {
    const member = value[field];
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${label}.${field} must be a non-negative safe integer.`);
    }
  }
  if (typeof value.followTail !== 'boolean') {
    throw new TypeError(`${label}.followTail must be a boolean.`);
  }
  const offsetRow = value.offsetRow;
  const offsetColumn = value.offsetColumn;
  if (typeof offsetRow !== 'number' || typeof offsetColumn !== 'number') {
    throw new TypeError(`${label} is invalid.`);
  }
  return {
    offsetRow,
    offsetColumn,
    followTail: value.followTail,
  };
}

function prepareScrollbar(value: ScrollbarOptions | undefined): ScrollbarOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('combobox scrollbar must be an object.');
  const visible = value['visible'];
  const axis = value['axis'];
  const visualState = value['visualState'];
  if (visible !== undefined && visible !== 'auto' && visible !== 'always' && visible !== 'never') {
    throw new TypeError('combobox scrollbar visible is invalid.');
  }
  if (axis !== undefined && axis !== 'vertical' && axis !== 'horizontal' && axis !== 'both') {
    throw new TypeError('combobox scrollbar axis is invalid.');
  }
  if (
    visualState !== undefined &&
    visualState !== 'idle' &&
    visualState !== 'active' &&
    visualState !== 'hover' &&
    visualState !== 'disabled' &&
    visualState !== 'inactive'
  ) {
    throw new TypeError('combobox scrollbar visualState is invalid.');
  }
  return {
    ...(visible === undefined ? {} : { visible }),
    ...(axis === undefined ? {} : { axis }),
    ...(visualState === undefined ? {} : { visualState }),
  };
}
