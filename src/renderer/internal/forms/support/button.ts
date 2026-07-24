import type { ButtonTone } from '../../../../ui-model/forms.ts';
import type { ElementVisualState } from '../../../../element/metadata.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import type { RenderSpan, TerminalStyle } from '../../frame.ts';
import { formSource, formSpan, separatorSpan } from '../../form-visual.ts';
import {
  mergeStyles,
  resolveRenderNodeStyle,
  themeStyle
} from '../../render-node-style.ts';
import {
  interactionVisualState,
  renderNodePointerVisualState
} from '../../pointer-interaction.ts';
import { renderInlineContent } from '../../inline-content.ts';

type ButtonNode = RenderNodeOfKind<unknown, 'button'>;

export function buttonSpans(
  renderNode: ButtonNode,
  label: string,
  focused: boolean,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const spans: RenderSpan[] = [];
  const visualState = buttonState(renderNode, focused);
  const style = buttonStyle(renderNode, focused);
  const frameStyle = buttonFrameStyle(renderNode, focused);
  if (focused && renderNode.props.disabled !== true) {
    spans.push(formSpan(renderNode, 'frame', 'frame.open', '[', frameStyle, visualState));
    spans.push(formSpan(renderNode, 'frame', 'frame.focus', theme.tokens.symbols.pointer, frameStyle, visualState));
  } else {
    spans.push(formSpan(renderNode, 'frame', 'frame.open', '[ ', frameStyle, visualState));
  }
  const state = buttonStateMarker(renderNode, theme);
  if (state.length > 0) {
    spans.push(formSpan(renderNode, 'state', 'state.marker', state, style, visualState));
    spans.push(separatorSpan(renderNode));
  }
  if (renderNode.props.leading !== undefined) {
    spans.push(...renderInlineContent(renderNode.props.leading, {
      theme,
      ...inlineBaseStyle(renderNode, 'leading', style),
      source: (_segment, index) => formSource(renderNode, 'leading', `leading.${String(index)}`, visualState)
    }));
    spans.push(separatorSpan(renderNode));
  }
  spans.push(formSpan(renderNode, 'label', 'label.text', label, style, visualState));
  if (renderNode.props.trailing !== undefined) {
    spans.push(separatorSpan(renderNode));
    spans.push(...renderInlineContent(renderNode.props.trailing, {
      theme,
      ...inlineBaseStyle(renderNode, 'trailing', style),
      source: (_segment, index) => formSource(renderNode, 'trailing', `trailing.${String(index)}`, visualState)
    }));
  }
  spans.push(formSpan(renderNode, 'frame', 'frame.close', ' ]', frameStyle, visualState));
  return spans;
}

function inlineBaseStyle(
  renderNode: ButtonNode,
  part: 'leading' | 'trailing',
  base: TerminalStyle | undefined
): { readonly baseStyle?: TerminalStyle } {
  const style = mergeStyles(base, renderNode.styles?.parts?.[part]);
  return style === undefined ? {} : { baseStyle: style };
}

export function buttonDescription(renderNode: ButtonNode): string {
  return [
    renderNode.props.state === 'pending' ? 'Pending.' : '',
    renderNodePointerVisualState(renderNode, buttonTargetId(renderNode)) === 'pressed' ? 'Pressed.' : '',
    buttonTone(renderNode) === 'destructive' ? 'Destructive action.' : ''
  ].filter((part) => part.length > 0).join(' ');
}

function buttonStateMarker(renderNode: ButtonNode, theme: TerminalTheme): string {
  if (renderNode.props.disabled === true) return '-';
  if (renderNode.props.state === 'pending') return theme.tokens.symbols.statusInfo;
  if (renderNodePointerVisualState(renderNode, buttonTargetId(renderNode)) === 'pressed') return theme.tokens.symbols.selected;
  return buttonTone(renderNode) === 'destructive' ? theme.tokens.symbols.statusError : '';
}

function buttonStyle(renderNode: ButtonNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(renderNode, focused);
  const base = buttonBaseStyle(renderNode);
  return resolveRenderNodeStyle(renderNode, {
    part: 'label',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonFrameStyle(renderNode: ButtonNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(renderNode, focused);
  const base = buttonFrameBaseStyle(renderNode);
  return resolveRenderNodeStyle(renderNode, {
    part: 'frame',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonBaseStyle(renderNode: ButtonNode): TerminalStyle | undefined {
  if (renderNode.props.state === 'pending') return themeStyle('status.pending', { bold: true });
  switch (buttonTone(renderNode)) {
    case 'default':
      return controlToneStyle('default');
    case 'primary':
      return controlToneStyle('primary');
    case 'secondary':
      return controlToneStyle('secondary');
    case 'destructive':
      return themeStyle('status.error', { bold: true });
  }
}

function buttonFrameBaseStyle(renderNode: ButtonNode): TerminalStyle | undefined {
  if (renderNode.props.state === 'pending') return themeStyle('status.pending', { bold: true });
  switch (buttonTone(renderNode)) {
    case 'default':
      return controlToneBorderStyle('default');
    case 'primary':
      return controlToneBorderStyle('primary');
    case 'secondary':
      return controlToneBorderStyle('secondary');
    case 'destructive':
      return themeStyle('status.error', { bold: true });
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

function buttonState(renderNode: ButtonNode, focused: boolean): ElementVisualState | undefined {
  if (renderNode.props.state === 'pending') return undefined;
  return interactionVisualState(renderNode, buttonTargetId(renderNode), {
    disabled: renderNode.props.disabled === true,
    focused
  });
}

function buttonTargetId(renderNode: ButtonNode): string {
  return `${renderNode.id ?? renderNode.kind}:control`;
}

function buttonTone(renderNode: ButtonNode): ButtonTone {
  switch (renderNode.props.tone) {
    case 'primary':
    case 'secondary':
    case 'destructive':
      return renderNode.props.tone;
    default:
      return 'default';
  }
}
