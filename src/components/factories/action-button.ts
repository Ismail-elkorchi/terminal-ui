import { defineComponent, ignoreMessage } from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentMeasureInput,
  ComponentRenderInput,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { ButtonOptions } from '../options/forms.ts';
import { inlineSegmentText, normalizeInlineContent } from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import { oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type { ButtonPressEvent, ButtonTone } from '../form-controls.ts';
import type { ButtonStylePart } from '../style-parts.ts';
import type { ComponentDensity } from '../density.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { assertOptionalEnum } from '../../foundation/validation.ts';
import { assertPressCallback, measureSpans } from './form-control-helpers.ts';

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

type ButtonComponentAction = ButtonPressEvent;

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
  createModel(value) {
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
        source: input.frameSource({ partName: 'frame.fill', partType: 'frame', cellRole: 'content' }),
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
  assertPressCallback(options, 'button');
  return instantiateButton({
    ...own,
    onAction: options.onPress,
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
  if (!('frameSource' in input)) return {};
  return {
    source: input.frameSource({
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

function isButtonTone(value: unknown): value is ButtonTone {
  return value === 'default' ||
    value === 'primary' ||
    value === 'secondary' ||
    value === 'ghost' ||
    value === 'destructive';
}
