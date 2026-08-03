import type { RenderNode, RenderNodesOfKind } from '../model/index.ts';
import { span } from './frame.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import type { FrameCellSource, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import { line } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, renderNodeStyle, themeStyle } from '../style-resolution.ts';
import type { ElementVisualState } from '../../element/metadata.ts';

export type FormVisualKind =
  | 'activeLine'
  | 'cursor'
  | 'day'
  | 'description'
  | 'error'
  | 'frame'
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
  | 'passwordInput'
  | 'toggleSwitch'
>;

export function formSpan(
  renderNode: RenderNode,
  visual: FormVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle,
  sourceState?: ElementVisualState
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: formSource(renderNode, visual, label, sourceState)
  });
}

export function formSource(
  renderNode: RenderNode,
  visual: FormVisualKind,
  label: string,
  state?: ElementVisualState
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'form',
    cellRole: roleForVisual(visual),
    partName: label,
    partType: visual,
    ...(isFrameCellInteractionState(state) ? { interactionState: state } : {}),
    description: label
  });
}

export function formLine(spans: readonly RenderSpan[]): RenderLine {
  return line(spans);
}

export function formLabelStyle(renderNode: RenderNode, state?: ElementVisualState): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, 'label', state), formValidationStyle(renderNode));
}

export function formValueStyle(renderNode: RenderNode, state?: ElementVisualState): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, formValuePart(renderNode), state), formValidationStyle(renderNode));
}

export function formPlaceholderStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return resolveRenderNodeStyle(renderNode, {
    part: renderNode.kind === 'toggleSwitch' ? 'offLabel' : 'description',
    base: themeStyle('input.placeholder', { dim: true })
  });
}

export function formMarkerStyle(renderNode: RenderNode, state?: ElementVisualState): TerminalStyle | undefined {
  const part = formMarkerPart(renderNode);
  return mergeStyles(
    renderNodeStyle(renderNode, part),
    state === undefined ? undefined : renderNodeStyle(renderNode, part, state),
    formValidationStyle(renderNode)
  );
}

function formValuePart(renderNode: RenderNode): string {
  switch (renderNode.kind) {
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

function formMarkerPart(renderNode: RenderNode): string {
  switch (renderNode.kind) {
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

export function formErrorStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('status.error', { bold: true }), renderNode.styles?.parts?.['error']);
}

export function formControlState(renderNode: FormStateNode, selected = false): ElementVisualState | undefined {
  if (renderNode.state?.disabled === true) return 'disabled';
  return selected ? 'selected' : undefined;
}

function formValidationStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return 'error' in renderNode.props
    && typeof renderNode.props.error === 'string'
    && renderNode.props.error.length > 0
    ? formErrorStyle(renderNode)
    : undefined;
}

export function optionControlState(
  renderNode: FormStateNode,
  input: {
    readonly selected: boolean;
    readonly disabled?: boolean;
    readonly active?: boolean;
  }
): ElementVisualState | undefined {
  if (input.disabled === true || renderNode.state?.disabled === true) return 'disabled';
  if (input.active === true) return 'focused';
  return input.selected ? 'selected' : undefined;
}

export function separatorSpan(renderNode: RenderNode, text = ' ', style?: TerminalStyle): RenderSpan {
  return formSpan(renderNode, 'separator', 'separator', text, style);
}

export function controlLabelSpans(
  renderNode: RenderNode,
  text: string,
  state?: ElementVisualState,
  options: { readonly required?: boolean; readonly label?: string } = {}
): readonly RenderSpan[] {
  return labelSpans(renderNode, options.label ?? 'label', text, state, options.required === true);
}

export function controlPrefixSpans(
  renderNode: RenderNode,
  text: string,
  state?: ElementVisualState,
  options: { readonly required?: boolean; readonly label?: string } = {}
): readonly RenderSpan[] {
  const label = controlLabelSpans(renderNode, text, state, options);
  if (label.length === 0) return [];
  return [
    ...label,
    formSpan(renderNode, 'separator', `${options.label ?? 'label'}.separator`, ': ')
  ];
}

export function labelSpans(
  renderNode: RenderNode,
  label: string,
  text: string,
  state?: ElementVisualState,
  required = false
): readonly RenderSpan[] {
  if (text.length === 0) {
    return required ? [formSpan(renderNode, 'required', `${label}.required`, 'Required', formLabelStyle(renderNode, state))] : [];
  }
  return [
    formSpan(renderNode, 'label', `${label}.text`, text, formLabelStyle(renderNode, state), state),
    ...(required ? [formSpan(renderNode, 'required', `${label}.required`, ' *', formLabelStyle(renderNode, state), state)] : [])
  ];
}

function roleForVisual(visual: FormVisualKind): NonNullable<FrameCellSource['cellRole']> {
  switch (visual) {
    case 'cursor':
      return 'cursor';
    case 'gutter':
    case 'separator':
      return 'separator';
    case 'activeLine':
    case 'frame':
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
