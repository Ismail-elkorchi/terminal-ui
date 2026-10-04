import type { TextPresentation } from '../text/presentation.ts';
import type { GraphicsBudgetLimits } from '../graphics/budget.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { TextWidthProfile } from '../text/types.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/theme.ts';
import type { RenderInstrumentation } from './contracts.ts';
import type { FramePass } from './frame-passes/frame-pass.ts';
import type { RenderBudgetLimits } from './render-budget.ts';


export interface RenderElementOptions {
  readonly focusPath?: FocusPath;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly widthProfile?: TextWidthProfile;
  readonly textPresentation?: TextPresentation | undefined;
  readonly framePasses?: readonly FramePass[];
  readonly disableFramePasses?: boolean;
  readonly instrumentation?: RenderInstrumentation;
  readonly limits?: Partial<RenderBudgetLimits>;
  readonly graphicsBudget?: Partial<GraphicsBudgetLimits>;
}
