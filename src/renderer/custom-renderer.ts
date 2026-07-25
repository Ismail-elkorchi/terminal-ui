import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderTarget } from './model/render-target.ts';
import type { Rect } from '../geometry/types.ts';
import type { Measurement } from './model/measurement.ts';
import type { FocusTarget, HitTarget } from './model/renderer.ts';
import type { RenderFocusRelation } from './model/renderer.ts';
import type { TextWidthProfile } from '../text/index.ts';

export interface CustomRendererInput<TState> {
  readonly state: TState;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface CustomRendererRenderInput<TState> extends CustomRendererInput<TState> {
  readonly target: RenderTarget;
  readonly focus: RenderFocusRelation;
}

export interface CustomRendererAccessibilityInput<TState> extends CustomRendererInput<TState> {
  readonly id: string;
  readonly focused: boolean;
}

export interface CustomRenderer<TState = undefined, TMessage = never> {
  measure?(input: CustomRendererInput<TState>): Measurement;
  render(input: CustomRendererRenderInput<TState>): void;
  accessibility?(input: CustomRendererAccessibilityInput<TState>): AccessibleNode;
  focusTargets?(input: CustomRendererInput<TState>): readonly FocusTarget[];
  hitTargets?(input: CustomRendererInput<TState>): readonly HitTarget<TMessage>[];
}
