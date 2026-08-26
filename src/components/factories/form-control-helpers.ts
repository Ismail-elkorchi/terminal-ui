import { assertRequiredCallback } from '../../foundation/validation.ts';
import { measureTextCells } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { RenderSpan } from '../../visual/render-content.ts';

export function assertPressCallback(
  options: { readonly onPress?: unknown },
  component: string,
): void {
  assertRequiredCallback(options.onPress, `${component} onPress`);
}

export function assertTransitionCallback(
  options: { readonly onTransition?: unknown },
  component: string,
): void {
  assertRequiredCallback(options.onTransition, `${component} onTransition`);
}

export function measureSpans(
  spans: readonly RenderSpan[],
  widthProfile: TextWidthProfile,
): number {
  return spans.reduce(
    (width, span) => width + measureTextCells(span.text, { widthProfile }).cells,
    0,
  );
}
