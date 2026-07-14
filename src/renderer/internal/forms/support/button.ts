import type { ButtonTone } from '../../../../ui-model/forms.ts';
import type { ElementVisualState } from '../../../../element/metadata.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import type { RenderSpan, TerminalStyle } from '../../frame.ts';
import { formSource, formSpan, separatorSpan } from '../../form-visual.ts';
import {
  defaultStyleForState,
  mergeStyles,
  resolveRenderNodeStyle,
  themeStyle
} from '../../render-node-style.ts';
import {
  interactionVisualState,
  renderNodePointerVisualState
} from '../../pointer-presentation.ts';
import { renderInlineContent } from '../../inline-content.ts';

type ButtonNode = RenderNodeOfKind<unknown, 'button'>;

export function buttonSpans(
  widget: ButtonNode,
  label: string,
  focused: boolean,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const spans: RenderSpan[] = [];
  const visualState = buttonState(widget, focused);
  const style = buttonStyle(widget, focused);
  const chromeStyle = buttonChromeStyle(widget, focused);
  if (focused && widget.props.disabled !== true) {
    spans.push(formSpan(widget, 'chrome', 'chrome.open', '[', chromeStyle, visualState));
    spans.push(formSpan(widget, 'chrome', 'chrome.focus', theme.tokens.symbols.pointer, chromeStyle, visualState));
  } else {
    spans.push(formSpan(widget, 'chrome', 'chrome.open', '[ ', chromeStyle, visualState));
  }
  const state = buttonStateMarker(widget, theme);
  if (state.length > 0) {
    spans.push(formSpan(widget, 'state', 'state.marker', state, style, visualState));
    spans.push(separatorSpan(widget));
  }
  if (widget.props.leading !== undefined) {
    spans.push(...renderInlineContent(widget.props.leading, {
      theme,
      ...inlineBaseStyle(widget, 'leading', style),
      source: (_segment, index) => formSource(widget, 'leading', `leading.${String(index)}`, visualState)
    }));
    spans.push(separatorSpan(widget));
  }
  spans.push(formSpan(widget, 'label', 'label.text', label, style, visualState));
  if (widget.props.trailing !== undefined) {
    spans.push(separatorSpan(widget));
    spans.push(...renderInlineContent(widget.props.trailing, {
      theme,
      ...inlineBaseStyle(widget, 'trailing', style),
      source: (_segment, index) => formSource(widget, 'trailing', `trailing.${String(index)}`, visualState)
    }));
  }
  spans.push(formSpan(widget, 'chrome', 'chrome.close', ' ]', chromeStyle, visualState));
  return spans;
}

function inlineBaseStyle(
  widget: ButtonNode,
  part: 'leading' | 'trailing',
  base: TerminalStyle | undefined
): { readonly baseStyle?: TerminalStyle } {
  const style = mergeStyles(base, widget.styles?.parts?.[part]);
  return style === undefined ? {} : { baseStyle: style };
}

export function buttonDescription(widget: ButtonNode): string {
  return [
    widget.props.state === 'pending' ? 'Pending.' : '',
    renderNodePointerVisualState(widget, buttonTargetId(widget)) === 'pressed' ? 'Pressed.' : '',
    buttonTone(widget) === 'destructive' ? 'Destructive action.' : ''
  ].filter((part) => part.length > 0).join(' ');
}

function buttonStateMarker(widget: ButtonNode, theme: TerminalTheme): string {
  if (widget.props.disabled === true) return '-';
  if (widget.props.state === 'pending') return theme.tokens.symbols.statusInfo;
  if (renderNodePointerVisualState(widget, buttonTargetId(widget)) === 'pressed') return theme.tokens.symbols.selected;
  return buttonTone(widget) === 'destructive' ? theme.tokens.symbols.statusError : '';
}

function buttonStyle(widget: ButtonNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(widget, focused);
  const base = buttonBaseStyle(widget);
  return resolveRenderNodeStyle(widget, {
    part: 'label',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonChromeStyle(widget: ButtonNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(widget, focused);
  const base = buttonChromeBaseStyle(widget);
  return resolveRenderNodeStyle(widget, {
    part: 'chrome',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonBaseStyle(widget: ButtonNode): TerminalStyle | undefined {
  if (widget.props.state === 'pending') return themeStyle('status.pending', { bold: true });
  switch (buttonTone(widget)) {
    case 'default':
      return controlToneStyle('default');
    case 'primary':
      return controlToneStyle('primary');
    case 'secondary':
      return controlToneStyle('secondary');
    case 'destructive':
      return mergeStyles(defaultStyleForState('error'), { bold: true });
  }
}

function buttonChromeBaseStyle(widget: ButtonNode): TerminalStyle | undefined {
  if (widget.props.state === 'pending') return themeStyle('status.pending', { bold: true });
  switch (buttonTone(widget)) {
    case 'default':
      return controlToneBorderStyle('default');
    case 'primary':
      return controlToneBorderStyle('primary');
    case 'secondary':
      return controlToneBorderStyle('secondary');
    case 'destructive':
      return mergeStyles(defaultStyleForState('error'), { bold: true });
  }
}

function controlToneStyle(tone: 'default' | 'primary' | 'secondary'): TerminalStyle {
  switch (tone) {
    case 'default':
      return {
        fg: { kind: 'theme', token: 'control.foreground' },
        bg: { kind: 'theme', token: 'control.background' }
      };
    case 'primary':
      return {
        fg: { kind: 'theme', token: 'control.primary.foreground' },
        bg: { kind: 'theme', token: 'control.primary.background' },
        bold: true
      };
    case 'secondary':
      return {
        fg: { kind: 'theme', token: 'control.secondary.foreground' },
        bg: { kind: 'theme', token: 'control.secondary.background' }
      };
  }
}

function controlToneBorderStyle(tone: 'default' | 'primary' | 'secondary'): TerminalStyle {
  switch (tone) {
    case 'default':
      return {
        fg: { kind: 'theme', token: 'control.border' },
        bg: { kind: 'theme', token: 'control.background' }
      };
    case 'primary':
      return {
        fg: { kind: 'theme', token: 'control.primary.border' },
        bg: { kind: 'theme', token: 'control.primary.background' },
        bold: true
      };
    case 'secondary':
      return {
        fg: { kind: 'theme', token: 'control.secondary.border' },
        bg: { kind: 'theme', token: 'control.secondary.background' }
      };
  }
}

function buttonState(widget: ButtonNode, focused: boolean): ElementVisualState | undefined {
  if (widget.props.state === 'pending') return undefined;
  return interactionVisualState(widget, buttonTargetId(widget), {
    disabled: widget.props.disabled === true,
    error: buttonTone(widget) === 'destructive',
    focused
  });
}

function buttonTargetId(widget: ButtonNode): string {
  return `${widget.id ?? widget.kind}:control`;
}

function buttonTone(widget: ButtonNode): ButtonTone {
  switch (widget.props.tone) {
    case 'primary':
    case 'secondary':
    case 'destructive':
      return widget.props.tone;
    default:
      return 'default';
  }
}
