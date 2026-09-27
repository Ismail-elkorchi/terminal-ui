import type { TerminalSize } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import { defineTextWidthProfile } from '../../text/width-profile.ts';
import { defaultTheme } from '../../theme/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/theme.ts';
import { resolveThemeInput } from '../../theme/theme.ts';
import { assertFrameDimensions } from './frame-limits.ts';

export interface RenderEnvironment {
  readonly terminalSize: TerminalSize;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderEnvironmentInput {
  readonly terminalSize: TerminalSize;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly widthProfile?: TextWidthProfile;
}

export function createRenderEnvironment(input: RenderEnvironmentInput): RenderEnvironment {
  assertFrameDimensions(input.terminalSize.columns, input.terminalSize.rows);
  const terminalSize = Object.freeze({
    columns: input.terminalSize.columns,
    rows: input.terminalSize.rows
  });
  const theme = input.theme === undefined
    ? defaultTheme
    : resolveThemeInput(input.theme, defaultTheme);
  return Object.freeze({
    terminalSize,
    theme,
    widthProfile: defineTextWidthProfile(input.widthProfile)
  });
}
