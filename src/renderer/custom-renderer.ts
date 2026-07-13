import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderTarget } from './model/render-target.ts';
import type { Rect } from '../geometry/types.ts';
import type { Measurement } from './model/measurement.ts';
import type { FocusTarget, HitTarget } from './model/renderer.ts';

interface CustomRendererInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export type CustomRendererMeasureInput<TState> = CustomRendererInput<TState>;

export interface CustomRendererRenderInput<TState> extends CustomRendererInput<TState> {
  readonly buffer: RenderTarget;
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
