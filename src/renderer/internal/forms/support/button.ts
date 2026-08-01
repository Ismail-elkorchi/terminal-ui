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
} from '../../../style-resolution.ts';
import {
  interactionVisualState,
  renderNodePointerVisualState
} from '../../pointer-interaction.ts';
import { renderInlineContent } from '../../inline-content.ts';
import { oneCellGlyph } from '../../../../text/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';

type ButtonNode = RenderNodeOfKind<unknown, 'button'>;

export function buttonSpans(
  renderNode: ButtonNode,
  label: string,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const spans: RenderSpan[] = [];
  const visualState = buttonState(renderNode, focused);
  const style = buttonStyle(renderNode, focused);
  const frameStyle = buttonFrameStyle(renderNode, focused);
  const compact = renderNode.props.density === 'compact';
  const marker = buttonStateMarker(renderNode, theme, focused, widthProfile);
  spans.push(formSpan(
    renderNode,
    'frame',
    'padding.leading',
    compact ? marker : `${marker} `,
    frameStyle,
    visualState
  ));
  if (renderNode.props.leading !== undefined) {
    spans.push(...renderInlineContent(renderNode.props.leading, {
      theme,
      ...inlineBaseStyle(renderNode, 'leading', style),
      source: (_segment, index) => formSource(renderNode, 'leading', `leading.${String(index)}`, visualState)
    }));
    spans.push(separatorSpan(renderNode, ' ', frameStyle));
  }
  spans.push(formSpan(renderNode, 'label', 'label.text', label, style, visualState));
  if (renderNode.props.trailing !== undefined) {
    spans.push(separatorSpan(renderNode, ' ', frameStyle));
    spans.push(...renderInlineContent(renderNode.props.trailing, {
      theme,
      ...inlineBaseStyle(renderNode, 'trailing', style),
      source: (_segment, index) => formSource(renderNode, 'trailing', `trailing.${String(index)}`, visualState)
    }));
  }
  spans.push(formSpan(
    renderNode,
    'frame',
    'padding.trailing',
    compact ? ' ' : '  ',
    frameStyle,
    visualState
  ));
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

function buttonStateMarker(
  renderNode: ButtonNode,
  theme: TerminalTheme,
  focused: boolean,
  widthProfile: TextWidthProfile
): string {
  const value = renderNode.props.state === 'pending'
    ? theme.tokens.symbols.statusInfo
    : renderNodePointerVisualState(renderNode, buttonTargetId(renderNode)) === 'pressed'
      ? theme.tokens.symbols.selected
      : buttonTone(renderNode) === 'destructive'
        ? theme.tokens.symbols.statusError
        : focused && renderNode.props.disabled !== true
          ? theme.tokens.symbols.pointer
          : ' ';
  return oneCellGlyph(value, ' ', { widthProfile });
}

function buttonStyle(renderNode: ButtonNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(renderNode, focused);
  const base = mergeStyles(buttonBaseStyle(renderNode), ghostFocusStyle(renderNode, state));
  return resolveRenderNodeStyle(renderNode, {
    part: 'label',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function buttonFrameStyle(renderNode: ButtonNode, focused: boolean): TerminalStyle | undefined {
  const state = buttonState(renderNode, focused);
  const base = mergeStyles(buttonFrameBaseStyle(renderNode), ghostFocusStyle(renderNode, state));
  return resolveRenderNodeStyle(renderNode, {
    part: 'frame',
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state })
  });
}

function ghostFocusStyle(renderNode: ButtonNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return buttonTone(renderNode) === 'ghost' && state === 'focused'
    ? { bg: { kind: 'theme', token: 'focus.background' } }
    : undefined;
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
    case 'ghost':
      return themeStyle('control.foreground');
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
    case 'ghost':
      return themeStyle('control.foreground');
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
    case 'ghost':
    case 'destructive':
      return renderNode.props.tone;
    default:
      return 'default';
  }
}
