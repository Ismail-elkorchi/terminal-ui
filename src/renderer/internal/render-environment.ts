import { defineTextWidthProfile } from '../../text/index.ts';
import { defineTheme, isTerminalTheme } from '../../theme/index.ts';
import type { ViewportSize } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';

export interface RenderEnvironment {
  readonly viewport: ViewportSize;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderEnvironmentInput {
  readonly viewport: ViewportSize;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly widthProfile?: TextWidthProfile;
}

export function createRenderEnvironment(input: RenderEnvironmentInput): RenderEnvironment {
  const viewport = Object.freeze({
    columns: nonNegativeInteger(input.viewport.columns, 'viewport columns'),
    rows: nonNegativeInteger(input.viewport.rows, 'viewport rows')
  });
  const theme = input.theme === undefined
    ? defineTheme()
    : isTerminalTheme(input.theme) ? input.theme : defineTheme(input.theme);
  return Object.freeze({
    viewport,
    theme,
    widthProfile: defineTextWidthProfile(input.widthProfile)
  });
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}
