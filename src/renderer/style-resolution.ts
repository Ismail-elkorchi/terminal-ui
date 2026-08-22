import type { ElementTextRole, ElementVisualState } from '../element/metadata.ts';
import type { ThemeColorToken } from '../theme/index.ts';
import type { RenderNode } from './model/index.ts';
import type { TerminalStyle } from '../visual/render.ts';
import { mergeTerminalStyles } from '../visual/terminal-style.ts';

export interface RenderNodeStyleInput {
  readonly part: string;
  readonly states?: readonly Exclude<ElementVisualState, 'default'>[];
  readonly applyDefaultStateStyle?: boolean;
  readonly base?: TerminalStyle;
}

export function resolveRenderNodeStyle(renderNode: RenderNode, input: RenderNodeStyleInput): TerminalStyle | undefined {
  const activeStates = input.states ?? [];
  return mergeStyles(
    input.base,
    renderNode.styles?.root,
    input.part === 'root' ? undefined : renderNode.styles?.parts?.[input.part],
    ...activeStates.flatMap((state) => [
      input.applyDefaultStateStyle === false ? undefined : defaultStyleForState(state),
      renderNode.styles?.states?.[state]?.root,
      input.part === 'root' ? undefined : renderNode.styles?.states?.[state]?.parts?.[input.part],
    ]),
  );
}

export function renderNodeStyle(renderNode: RenderNode, part: string, state?: ElementVisualState): TerminalStyle | undefined {
  return resolveRenderNodeStyle(renderNode, {
    part,
    ...(state === undefined || state === 'default' ? {} : { states: [state] })
  });
}

export function defaultStyleForTextRole(role: ElementTextRole): TerminalStyle | undefined {
  switch (role) {
    case 'title':
      return themeStyle('surface.title', { bold: true });
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
  }
}

export function defaultStyleForState(state: ElementVisualState): TerminalStyle | undefined {
  switch (state) {
    case 'default':
      return undefined;
    case 'focused':
      return { bold: true };
    case 'hovered':
      return {
        bg: { kind: 'theme', token: 'focus.background' }
      };
    case 'pressed':
      return {
        bold: true
      };
    case 'selected':
      return {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
        bold: true
      };
    case 'disabled':
      return themeStyle('text.disabled', { dim: true });
    case 'active':
      return { bold: true };
    case 'busy':
      return { fg: { kind: 'theme', token: 'status.pending' }, bold: true };
    case 'readOnly':
      return { fg: { kind: 'theme', token: 'text.muted' } };
  }
}

export function themeStyle(token: ThemeColorToken, options: Omit<TerminalStyle, 'fg'> = {}): TerminalStyle {
  return {
    fg: { kind: 'theme', token },
    ...options
  };
}

export function mergeStyles(...styles: readonly (TerminalStyle | undefined)[]): TerminalStyle | undefined {
  return mergeTerminalStyles(...styles);
}
