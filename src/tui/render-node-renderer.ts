import type { AccessibleNode } from '../accessibility/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { CursorPosition } from './cursor.ts';
import type { FrameBuffer } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { Measurement } from './measurement.ts';
import type { PointerEventKind, RoutedPointerEvent } from './pointer-types.ts';

export interface RenderNodeMeasureInput<TMessage = unknown> {
  readonly renderNode: RenderNode<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface RenderNodeLayoutInput<TMessage = unknown> {
  readonly renderNode: RenderNode<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly childMeasures: readonly Measurement[];
}

export interface RenderNodeRenderInput<TMessage = unknown> {
  readonly renderNode: RenderNode<TMessage>;
  readonly layoutNode: LayoutNode;
  readonly buffer: FrameBuffer;
  readonly theme: TerminalTheme;
  readonly focused: boolean;
  renderChildren(target?: FrameBuffer): void;
}

export interface RenderNodeAccessibilityInput<TMessage = unknown> {
  readonly renderNode: RenderNode<TMessage>;
  readonly layoutNode: LayoutNode;
  readonly id: string;
  readonly focused: boolean;
  readonly theme: TerminalTheme;
}

export interface RenderNodeFocusInput<TMessage = unknown> {
  readonly renderNode: RenderNode<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface FocusTarget {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: CursorPosition;
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scopeId?: string;
}

export interface RenderNodeHitInput<TMessage = unknown> {
  readonly renderNode: RenderNode<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface HitTarget<TMessage = unknown> {
  readonly id: string;
  readonly bounds: Rect;
  readonly accepts?: readonly PointerEventKind[];
  message(event: RoutedPointerEvent): TMessage | undefined;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
}

export interface RenderNodeRenderer<TMessage = unknown> {
  measure?(input: RenderNodeMeasureInput<TMessage>): Measurement;
  layout?(input: RenderNodeLayoutInput<TMessage>): readonly Rect[];
  render(input: RenderNodeRenderInput<TMessage>): void;
  accessibility?(input: RenderNodeAccessibilityInput<TMessage>): AccessibleNode;
  focusTargets?(input: RenderNodeFocusInput<TMessage>): readonly FocusTarget[];
  hitTargets?(input: RenderNodeHitInput<TMessage>): readonly HitTarget<TMessage>[];
}
