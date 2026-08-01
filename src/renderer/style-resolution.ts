import type { ElementTextRole, ElementVisualState } from '../element/metadata.ts';
import { resolveThemeColor } from '../theme/index.ts';
import type { TerminalTheme, ThemeColorToken } from '../theme/index.ts';
import type { RenderNode } from './model/index.ts';
import type { TerminalStyle } from '../visual/render.ts';

export interface RenderNodeStyleInput {
  readonly part: string;
  readonly state?: ElementVisualState;
  readonly base?: TerminalStyle;
}

export function resolveRenderNodeStyle(renderNode: RenderNode, input: RenderNodeStyleInput): TerminalStyle | undefined {
  return mergeStyles(
    defaultStyleForPart(input.part),
    input.base,
    input.part === 'root' ? renderNode.styles?.root : renderNode.styles?.parts?.[input.part],
    input.state === undefined || input.state === 'default' ? undefined : defaultStyleForState(input.state),
    input.state === undefined || input.state === 'default' ? undefined : renderNode.styles?.states?.[input.state]
  );
}

export function renderNodeStyle(renderNode: RenderNode, part: string, state?: ElementVisualState): TerminalStyle | undefined {
  return resolveRenderNodeStyle(renderNode, {
    part,
    ...(state === undefined ? {} : { state })
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

export function defaultStyleForPart(part: string): TerminalStyle | undefined {
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
      return defaultStyleForState('selected');
    case 'focused':
      return defaultStyleForState('focused');
    case 'disabled':
      return defaultStyleForState('disabled');
    default:
      return undefined;
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
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
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

export function styleHasBackground(style: TerminalStyle | undefined, theme: TerminalTheme): boolean {
  const background = style?.bg;
  return background !== undefined
    && (background.kind !== 'theme' || resolveThemeColor(theme, background.token) !== undefined);
}
