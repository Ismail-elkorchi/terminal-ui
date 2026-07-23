import type { RenderNode, RenderNodesOfKind } from '../model/index.ts';
import { span } from './frame.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import type { FrameCellSource, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import { line } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, renderNodeStyle, themeStyle } from './render-node-style.ts';
import type { ElementVisualState } from '../../element/metadata.ts';

export type FormControlState = ElementVisualState;

export type FormVisualKind =
  | 'activeLine'
  | 'chrome'
  | 'cursor'
  | 'day'
  | 'description'
  | 'error'
  | 'handle'
  | 'help'
  | 'label'
  | 'leading'
  | 'lineNumber'
  | 'gutter'
  | 'highlight'
  | 'marker'
  | 'option'
  | 'placeholder'
  | 'required'
  | 'selection'
  | 'separator'
  | 'state'
  | 'summary'
  | 'swatch'
  | 'title'
  | 'track'
  | 'trailing'
  | 'value'
  | 'weekday';

type FormStateNode = RenderNodesOfKind<
  unknown,
  | 'checkbox'
  | 'checkboxGroup'
  | 'colorSwatchPicker'
  | 'calendar'
  | 'numberInput'
  | 'radioGroup'
  | 'rangeSlider'
  | 'select'
  | 'slider'
  | 'textInput'
  | 'toggleSwitch'
>;

export function formSpan(
  widget: RenderNode,
  visual: FormVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle,
  sourceState?: ElementVisualState
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: formSource(widget, visual, label, sourceState)
  });
}

export function formSource(
  widget: RenderNode,
  visual: FormVisualKind,
  label: string,
  state?: ElementVisualState
): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: 'form',
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    ...(isFrameCellInteractionState(state) ? { state } : {}),
    label
  });
}

export function formLine(spans: readonly RenderSpan[]): RenderLine {
  return line(spans);
}

export function formLabelStyle(widget: RenderNode, state?: FormControlState): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'label', state);
}

export function formValueStyle(widget: RenderNode, state?: FormControlState): TerminalStyle | undefined {
  return renderNodeStyle(widget, formValuePart(widget), state);
}

export function formPlaceholderStyle(widget: RenderNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    part: widget.kind === 'toggleSwitch' ? 'offLabel' : 'description',
    base: themeStyle('input.placeholder', { dim: true })
  });
}

export function formMarkerStyle(widget: RenderNode, state?: FormControlState): TerminalStyle | undefined {
  const part = formMarkerPart(widget);
  return mergeStyles(renderNodeStyle(widget, part), state === undefined ? undefined : renderNodeStyle(widget, part, state));
}

function formValuePart(widget: RenderNode): string {
  switch (widget.kind) {
    case 'checkbox':
    case 'checkboxGroup':
    case 'radioGroup':
    case 'select':
      return 'option';
    case 'field':
      return 'description';
    default:
      return 'value';
  }
}

function formMarkerPart(widget: RenderNode): string {
  switch (widget.kind) {
    case 'colorSwatchPicker':
    case 'calendar':
      return 'navigation';
    case 'numberInput':
      return 'stepper';
    case 'slider':
    case 'rangeSlider':
      return 'handle';
    case 'toggleSwitch':
      return 'track';
    default:
      return 'marker';
  }
}

export function formErrorStyle(widget: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'error', 'error');
}

export function formControlState(widget: FormStateNode, selected = false): FormControlState | undefined {
  if (widget.props.disabled === true) return 'disabled';
  if (typeof widget.props.error === 'string' && widget.props.error.length > 0) return 'error';
  return selected ? 'selected' : undefined;
}

export function optionControlState(
  widget: FormStateNode,
  input: {
    readonly selected: boolean;
    readonly disabled?: boolean;
    readonly active?: boolean;
  }
): FormControlState | undefined {
  if (input.disabled === true || widget.props.disabled === true) return 'disabled';
  if (input.active === true) return 'focused';
  return input.selected ? 'selected' : undefined;
}

export function separatorSpan(widget: RenderNode, text = ' '): RenderSpan {
  return formSpan(widget, 'separator', 'separator', text);
}

export function controlLabelSpans(
  widget: RenderNode,
  text: string,
  state?: FormControlState,
  options: { readonly required?: boolean; readonly label?: string } = {}
): readonly RenderSpan[] {
  return labelSpans(widget, options.label ?? 'label', text, state, options.required === true);
}

export function controlPrefixSpans(
  widget: RenderNode,
  text: string,
  state?: FormControlState,
  options: { readonly required?: boolean; readonly label?: string } = {}
): readonly RenderSpan[] {
  const label = controlLabelSpans(widget, text, state, options);
  if (label.length === 0) return [];
  return [
    ...label,
    formSpan(widget, 'separator', `${options.label ?? 'label'}.separator`, ': ')
  ];
}

export function labelSpans(
  widget: RenderNode,
  label: string,
  text: string,
  state?: FormControlState,
  required = false
): readonly RenderSpan[] {
  if (text.length === 0) {
    return required ? [formSpan(widget, 'required', `${label}.required`, 'Required', formLabelStyle(widget, state))] : [];
  }
  return [
    formSpan(widget, 'label', `${label}.text`, text, formLabelStyle(widget, state), state),
    ...(required ? [formSpan(widget, 'required', `${label}.required`, ' *', formLabelStyle(widget, state), state)] : [])
  ];
}

function roleForVisual(visual: FormVisualKind): NonNullable<FrameCellSource['role']> {
  switch (visual) {
    case 'cursor':
      return 'cursor';
    case 'gutter':
    case 'separator':
      return 'separator';
    case 'activeLine':
    case 'chrome':
    case 'handle':
    case 'marker':
    case 'required':
    case 'state':
    case 'swatch':
    case 'track':
      return 'decoration';
    case 'day':
    case 'description':
    case 'error':
    case 'help':
    case 'highlight':
    case 'label':
    case 'lineNumber':
    case 'leading':
    case 'option':
    case 'placeholder':
    case 'selection':
    case 'summary':
    case 'title':
    case 'trailing':
    case 'value':
    case 'weekday':
      return 'text';
  }
}
