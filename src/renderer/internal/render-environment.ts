import { defineTextWidthProfile } from '../../text/index.ts';
import { defaultTheme, defineTheme, isTerminalTheme } from '../../theme/index.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
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
    : isTerminalTheme(input.theme) ? input.theme : defineTheme(input.theme);
  return Object.freeze({
    terminalSize,
    theme,
    widthProfile: defineTextWidthProfile(input.widthProfile)
  });
}
