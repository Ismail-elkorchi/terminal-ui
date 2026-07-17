import type { ViewportSize } from '../../../geometry/types.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { FrameBuffer } from '../frame.ts';

export type { FrameSemanticRole } from '../../../visual/source.ts';

export interface FramePass {
  readonly id: string;
  apply(buffer: FrameBuffer, context: FramePassContext): void;
}

export interface FramePassContext {
  readonly theme: TerminalTheme;
  readonly viewport: ViewportSize;
}

export function applyFramePasses(
  buffer: FrameBuffer,
  passes: readonly FramePass[],
  context: FramePassContext
): void {
  for (const pass of passes) pass.apply(buffer, context);
}
