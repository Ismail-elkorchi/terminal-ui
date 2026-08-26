import type { Element } from '../element/index.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { GraphicsBudgetLimits } from '../graphics/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { FocusPath } from './frame.ts';
import type { FramePass } from './frame-passes/index.ts';
import type { Frame } from './frame.ts';
import { renderElementInternal } from './internal/render-element.ts';
import type { RenderInstrumentation } from './contracts.ts';
import type { RenderBudgetLimits } from './render-budget.ts';

export interface RenderElementOptions {
  readonly focusPath?: FocusPath;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly widthProfile?: TextWidthProfile;
  readonly framePasses?: readonly FramePass[];
  readonly disableFramePasses?: boolean;
  readonly instrumentation?: RenderInstrumentation;
  readonly limits?: Partial<RenderBudgetLimits>;
  readonly graphicsBudget?: Partial<GraphicsBudgetLimits>;
}

export function renderElementFrame(
  element: Element<unknown>,
  terminalSize: TerminalSize,
  options: RenderElementOptions = {},
): Frame {
  return renderElementInternal(element, terminalSize, options).frame;
}
