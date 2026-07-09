import type { RenderNodeStyleSlots } from '../render-node/index.ts';
import type { RenderNodeTextRole } from '../render-node/index.ts';
import type { RenderNodeVisualState } from '../render-node/index.ts';
import type { ThemeColorToken } from '../theme/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { TerminalStyle } from './render-primitives.ts';

export type RenderNodeStyleSlot = keyof RenderNodeStyleSlots;

export interface RenderNodeStyleInput {
  readonly slot: RenderNodeStyleSlot;
  readonly state?: RenderNodeVisualState;
  readonly base?: TerminalStyle;
}

export function resolveRenderNodeStyle(widget: RenderNode, input: RenderNodeStyleInput): TerminalStyle | undefined {
  const stateSlot = input.state === undefined || input.state === 'default' ? undefined : styleSlotForState(input.state);
  return mergeStyles(
    defaultStyleForSlot(input.slot),
    input.base,
    widget.styles?.[input.slot],
    input.state === undefined || input.state === 'default' ? undefined : defaultStyleForState(input.state),
    stateSlot === undefined ? undefined : widget.styles?.[stateSlot]
  );
}

export function renderNodeStyle(widget: RenderNode, slot: RenderNodeStyleSlot, state?: RenderNodeVisualState): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    slot,
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

export function defaultStyleForSlot(slot: RenderNodeStyleSlot): TerminalStyle | undefined {
  switch (slot) {
    case 'root':
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
      return defaultStyleForState(slot);
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

function styleSlotForState(state: RenderNodeVisualState): RenderNodeStyleSlot | undefined {
  switch (state) {
    case 'default':
    case 'active':
      return undefined;
    case 'focused':
    case 'selected':
    case 'disabled':
    case 'error':
    case 'warning':
    case 'success':
      return state;
  }
}
