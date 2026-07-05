import type { Widget } from '../widgets/index.ts';
import { span } from './frame.ts';
import { widgetFrameSource } from './frame-source.ts';
import type { FrameCellSource, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import { line } from './render-primitives.ts';
import { mergeStyles, widgetStyle } from './widget-style.ts';

export type FormControlState =
  | 'default'
  | 'selected'
  | 'disabled'
  | 'focused'
  | 'active'
  | 'error'
  | 'warning'
  | 'success';

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
  | 'value'
  | 'weekday';

export function formSpan(
  widget: Widget,
  visual: FormVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: formSource(widget, visual, label)
  });
}

export function formSource(widget: Widget, visual: FormVisualKind, label: string): FrameCellSource {
  return widgetFrameSource(widget, {
    family: 'form',
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    label
  });
}

export function formLine(spans: readonly RenderSpan[]): RenderLine {
  return line(spans);
}

export function formLabelStyle(widget: Widget, state?: FormControlState): TerminalStyle | undefined {
  return widgetStyle(widget, 'label', state);
}

export function formValueStyle(widget: Widget, state?: FormControlState): TerminalStyle | undefined {
  return widgetStyle(widget, 'value', state);
}

export function formPlaceholderStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
}

export function formMarkerStyle(widget: Widget, state?: FormControlState): TerminalStyle | undefined {
  return mergeStyles(widgetStyle(widget, 'value'), state === undefined ? undefined : widgetStyle(widget, 'value', state));
}

export function formErrorStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'error', 'error');
}

export function formControlState(widget: Widget, selected = false): FormControlState | undefined {
  if (widget.props['disabled'] === true) return 'disabled';
  if (typeof widget.props['error'] === 'string' && widget.props['error'].length > 0) return 'error';
  return selected ? 'selected' : undefined;
}

export function optionControlState(
  widget: Widget,
  input: {
    readonly selected: boolean;
    readonly disabled?: boolean;
    readonly active?: boolean;
  }
): FormControlState | undefined {
  if (input.disabled === true || widget.props['disabled'] === true) return 'disabled';
  if (input.active === true) return 'focused';
  return input.selected ? 'selected' : undefined;
}

export function separatorSpan(widget: Widget, text = ' '): RenderSpan {
  return formSpan(widget, 'separator', 'separator', text);
}

export function controlLabelSpans(
  widget: Widget,
  text: string,
  state?: FormControlState,
  options: { readonly required?: boolean; readonly label?: string } = {}
): readonly RenderSpan[] {
  return labelSpans(widget, options.label ?? 'label', text, state, options.required === true);
}

export function controlPrefixSpans(
  widget: Widget,
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
  widget: Widget,
  label: string,
  text: string,
  state?: FormControlState,
  required = false
): readonly RenderSpan[] {
  if (text.length === 0) {
    return required ? [formSpan(widget, 'required', `${label}.required`, 'Required', formLabelStyle(widget, state))] : [];
  }
  return [
    formSpan(widget, 'label', `${label}.text`, text, formLabelStyle(widget, state)),
    ...(required ? [formSpan(widget, 'required', `${label}.required`, ' *', formLabelStyle(widget, state))] : [])
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
    case 'option':
    case 'placeholder':
    case 'selection':
    case 'summary':
    case 'title':
    case 'value':
    case 'weekday':
      return 'text';
  }
}
