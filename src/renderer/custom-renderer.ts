import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { FrameBuffer } from '../tui/frame.ts';
import type { Rect } from '../tui/layout.ts';
import type { Measurement } from '../tui/measurement.ts';
import type { FocusTarget, HitTarget } from '../tui/render-node-renderer.ts';

interface CustomRendererInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export type CustomRendererMeasureInput<TState> = CustomRendererInput<TState>;

export interface CustomRendererRenderInput<TState> extends CustomRendererInput<TState> {
  readonly buffer: FrameBuffer;
  readonly focused: boolean;
}

export interface CustomRendererAccessibilityInput<TState> extends CustomRendererInput<TState> {
  readonly id: string;
  readonly focused: boolean;
}

export type CustomRendererFocusInput<TState> = CustomRendererInput<TState>;
export type CustomRendererHitInput<TState> = CustomRendererInput<TState>;

export interface CustomRenderer<TState = undefined, TMessage = never> {
  measure?(input: CustomRendererMeasureInput<TState>): Measurement;
  render(input: CustomRendererRenderInput<TState>): void;
  accessibility?(input: CustomRendererAccessibilityInput<TState>): AccessibleNode;
  focusTargets?(input: CustomRendererFocusInput<TState>): readonly FocusTarget[];
  hitTargets?(input: CustomRendererHitInput<TState>): readonly HitTarget<TMessage>[];
}
