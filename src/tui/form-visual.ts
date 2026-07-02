import type { Widget } from '../widgets/index.ts';
import { span } from './frame.ts';
import type { RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
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

export function formSpan(
  widget: Widget,
  label: string,
  text: string,
  style?: TerminalStyle,
  role: 'text' | 'separator' | 'decoration' = 'text'
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: {
      kind: widget.kind,
      role,
      ...(widget.id === undefined ? {} : { id: widget.id }),
      label
    }
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
  return formSpan(widget, 'separator', text, undefined, 'separator');
}

export function controlLabelSpans(widget: Widget, text: string, state?: FormControlState): readonly RenderSpan[] {
  return text.length === 0 ? [] : [formSpan(widget, 'label', text, formLabelStyle(widget, state))];
}

export function controlPrefixSpans(widget: Widget, text: string, state?: FormControlState): readonly RenderSpan[] {
  return text.length === 0 ? [] : [
    formSpan(widget, 'label', text, formLabelStyle(widget, state)),
    formSpan(widget, 'separator', ': ', undefined, 'separator')
  ];
}
