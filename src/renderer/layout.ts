import { defineTextPresentation } from '../text/presentation.ts';
import type { TextPresentation } from '../text/presentation.ts';
import type { Element } from '../element/types.ts';
import type { Rect, TerminalSize } from '../geometry/types.ts';
import type { TextWidthProfile } from '../text/types.ts';
import { defaultTextWidthProfile } from '../text/width-profile.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/theme.ts';
import type { LayoutNode } from './contracts.ts';
import { layoutRenderTree } from './internal/render-tree-layout.ts';
import { toRenderNode } from './internal/render-tree/element.ts';
import type { RenderBudgetLimits } from './render-budget.ts';
import { createRenderBudget } from './render-budget.ts';

export type { Rect } from '../geometry/types.ts';

export function layoutElement(
  element: Element<unknown>,
  terminalSizeOrBounds: TerminalSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile,
  limits?: Partial<RenderBudgetLimits>,
  textPresentation?: TextPresentation,
): LayoutNode {
  return layoutRenderTree(
    toRenderNode(element),
    terminalSizeOrBounds,
    themeInput,
    widthProfile,
    createRenderBudget(limits),
    undefined,
    undefined,
    textPresentation === undefined ? undefined : defineTextPresentation(textPresentation),
  ).layout;
}
