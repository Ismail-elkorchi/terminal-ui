import { defineTextWidthProfile } from '../../text/index.ts';
import { defaultTheme, defineTheme, isTerminalTheme } from '../../theme/index.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';

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
  const terminalSize = Object.freeze({
    columns: nonNegativeInteger(input.terminalSize.columns, 'terminal size columns'),
    rows: nonNegativeInteger(input.terminalSize.rows, 'terminal size rows')
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

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}
