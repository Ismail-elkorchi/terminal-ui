import type { RenderNodeTextRole } from '../render-node/index.ts';
import type { RenderNodeVisualState } from '../render-node/index.ts';
import type { ThemeColorToken } from '../theme/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { TerminalStyle } from './render-primitives.ts';

export type RenderNodeStylePart = string;

export interface RenderNodeStyleInput {
  readonly part: RenderNodeStylePart;
  readonly state?: RenderNodeVisualState;
  readonly base?: TerminalStyle;
}

export function resolveRenderNodeStyle(widget: RenderNode, input: RenderNodeStyleInput): TerminalStyle | undefined {
  return mergeStyles(
    defaultStyleForPart(input.part),
    input.base,
    input.part === 'root' ? widget.styles?.root : widget.styles?.parts?.[input.part],
    input.state === undefined || input.state === 'default' ? undefined : defaultStyleForState(input.state),
    input.state === undefined || input.state === 'default' ? undefined : widget.styles?.states?.[input.state]
  );
}

export function renderNodeStyle(widget: RenderNode, part: RenderNodeStylePart, state?: RenderNodeVisualState): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    part,
    ...(state === undefined ? {} : { state })
  });
}

export function defaultStyleForTextRole(role: RenderNodeTextRole): TerminalStyle | undefined {
  switch (role) {
    case 'title':
      return themeStyle('surface.title', { bold: true });
    case 'subtitle':
    case 'caption':
    case 'metadata':
      return themeStyle('text.muted', { dim: true });
    case 'heading':
      return themeStyle('text.strong', { bold: true });
    case 'body':
      return themeStyle('text.default');
    case 'metric':
      return themeStyle('accent.primary', { bold: true });
    case 'badge':
      return {
        fg: { kind: 'theme', token: 'badge.foreground' },
        bg: { kind: 'theme', token: 'badge.background' },
        bold: true
      };
    case 'danger':
      return themeStyle('status.error', { bold: true });
    case 'warning':
      return themeStyle('status.warning', { bold: true });
    case 'success':
      return themeStyle('status.success', { bold: true });
  }
}

export function defaultStyleForPart(part: RenderNodeStylePart): TerminalStyle | undefined {
  switch (part) {
    case 'root':
    case 'content':
    case 'value':
      return themeStyle('text.default');
    case 'border':
      return themeStyle('surface.border');
    case 'title':
      return themeStyle('surface.title', { bold: true });
    case 'label':
      return themeStyle('text.strong');
    case 'placeholder':
      return themeStyle('input.placeholder', { dim: true });
    case 'selected':
    case 'focused':
    case 'disabled':
    case 'error':
    case 'warning':
    case 'success':
      return defaultStyleForState(part);
    default:
      return undefined;
  }
}

export function defaultStyleForState(state: RenderNodeVisualState): TerminalStyle | undefined {
  switch (state) {
    case 'default':
      return undefined;
    case 'focused':
      return themeStyle('accent.primary', { bold: true });
    case 'selected':
      return {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
        bold: true
      };
    case 'disabled':
      return themeStyle('text.disabled', { dim: true });
    case 'active':
      return themeStyle('accent.secondary', { bold: true });
    case 'error':
      return themeStyle('status.error');
    case 'warning':
      return themeStyle('status.warning');
    case 'success':
      return themeStyle('status.success', { bold: true });
  }
}

export function themeStyle(token: ThemeColorToken, options: Omit<TerminalStyle, 'fg'> = {}): TerminalStyle {
  return {
    fg: { kind: 'theme', token },
    ...options
  };
}

export function inputCursorStyle(): TerminalStyle {
  return themeStyle('input.cursor', {
    bold: true,
    inverse: true
  });
}

export function mergeStyles(...styles: readonly (TerminalStyle | undefined)[]): TerminalStyle | undefined {
  const merged = styles.reduce<TerminalStyle>((current, style) => style === undefined ? current : { ...current, ...style }, {});
  return Object.keys(merged).length === 0 ? undefined : merged;
}
