import { assertRequiredCallback } from '../../foundation/validation.ts';
import { measureTextCells } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { RenderSpan } from '../../visual/render-content.ts';

export function assertPressCallback<TOptions extends { readonly onPress?: unknown }>(
  options: TOptions,
  component: string,
): asserts options is TOptions & { readonly onPress: NonNullable<TOptions['onPress']> } {
  assertRequiredCallback(options.onPress, `${component} onPress`);
}

export function assertTransitionCallback<TOptions extends { readonly onTransition?: unknown }>(
  options: TOptions,
  component: string,
): asserts options is TOptions & { readonly onTransition: NonNullable<TOptions['onTransition']> } {
  assertRequiredCallback(options.onTransition, `${component} onTransition`);
}

export function withoutTransitionCallback<TOptions extends { readonly onTransition?: unknown }>(
  options: TOptions,
): Omit<TOptions, 'onTransition'> {
  const { onTransition, ...rest } = options;
  void onTransition;
  return rest;
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
