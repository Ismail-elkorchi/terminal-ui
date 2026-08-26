import type { Element } from '../element/index.ts';
import type { Rect, TerminalSize } from '../geometry/types.ts';
import type { TextWidthProfile } from '../text/index.ts';
import { defaultTextWidthProfile } from '../text/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { LayoutNode } from './contracts.ts';
import { toRenderNode } from './internal/render-tree/element.ts';
import { layoutRenderNode } from './internal/render-tree-layout.ts';
import { createRenderBudget } from './render-budget.ts';
import type { RenderBudgetLimits } from './render-budget.ts';

export type { Rect } from '../geometry/types.ts';

export function layoutElement(
  element: Element<unknown>,
  terminalSizeOrBounds: TerminalSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile,
  limits?: Partial<RenderBudgetLimits>,
): LayoutNode {
  return layoutRenderNode(
    toRenderNode(element),
    terminalSizeOrBounds,
    themeInput,
    widthProfile,
    createRenderBudget(limits),
  );
}
