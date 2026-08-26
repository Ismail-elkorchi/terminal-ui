import { clipRenderSpans, defineComponent, measureRenderSpans } from '../../component/index.ts';
import type {
  ComponentMessage,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { CheckboxOptions, SwitchOptions } from '../options/forms.ts';
import { oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { CheckboxTransition, SwitchTransition } from '../form-controls.ts';
import type { ChoiceStylePart } from '../style-parts.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { assertTransitionCallback, measureSpans } from './form-control-helpers.ts';

interface CheckboxModel {
  readonly label: string;
  readonly checked: boolean;
  readonly required: boolean;
  readonly error: string;
}

type CheckboxComponentAction = CheckboxTransition;

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
  createModel(value) {
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
  assertTransitionCallback(options, 'checkbox');
  return instantiateCheckbox({
    ...own,
    onAction: options.onTransition,
  });
};

interface ToggleModel {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel: string;
  readonly offLabel: string;
  readonly error: string;
}

type SwitchComponentAction = SwitchTransition;

type SwitchFactory = <const TMessage extends ComponentMessage = never>(
  options: SwitchOptions<TMessage>,
) => Element<TMessage>;

const instantiateSwitch: SemanticLeafComponentFactory<
  Pick<
    SwitchOptions<ComponentMessage>,
    'label' | 'checked' | 'onLabel' | 'offLabel' | 'error'
  >,
  SwitchComponentAction,
  import('../../components/style-parts.ts').ToggleStylePart,
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
  import('../../components/style-parts.ts').ToggleStylePart,
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
  createModel(value) {
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
  assertTransitionCallback(options, 'switchControl');
  return instantiateSwitch({
    ...own,
    onAction: options.onTransition,
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
  readonly frameSource?: (
    input?: import('../../component/index.ts').ComponentFrameSourceInput,
  ) => import('../../visual/frame-source.ts').FrameCellSource;
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
  input: ControlVisualInput<ToggleModel, import('../../components/style-parts.ts').ToggleStylePart>,
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
  if (!decorated || input.style === undefined || input.frameSource === undefined) {
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
    source: input.frameSource({
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
