import type { ThemeColorToken } from '../visual/color.ts';
import type { ElementVisualState } from '../visual/frame-source.ts';
import type { TerminalStyle } from '../visual/render-content.ts';
import { mergeTerminalStyles } from '../visual/terminal-style.ts';
import type { RenderNode } from './internal/render-tree/types.ts';

export interface RenderNodeStyleInput {
  readonly part: string;
  readonly states?: readonly Exclude<ElementVisualState, 'default'>[];
  readonly applyDefaultStateStyle?: boolean;
  readonly base?: TerminalStyle;
}

export function resolveRenderNodeStyle(renderNode: RenderNode, input: RenderNodeStyleInput): TerminalStyle | undefined {
  const activeStates = input.states ?? [];
  return mergeTerminalStyles(
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
