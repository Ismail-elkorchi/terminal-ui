import type { AccessibleNode } from '../accessibility/index.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from '../render-node/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { CursorPosition } from './cursor.ts';
import type { FrameBuffer } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { Measurement } from './measurement.ts';
import type { PointerEventKind, RoutedPointerEvent } from './pointer-types.ts';

type RendererNode<TMessage, TKind extends RenderNodeKind> =
  RenderNodeKind extends TKind
    ? RenderNode<TMessage>
    : RenderNodeOfKind<TMessage, TKind>;

export interface RenderNodeMeasureInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface RenderNodeLayoutInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly childMeasures: readonly Measurement[];
}

export interface RenderNodeRenderInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly buffer: FrameBuffer;
  readonly theme: TerminalTheme;
  readonly focused: boolean;
  renderChildren(target?: FrameBuffer): void;
}

export interface RenderNodeAccessibilityInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly id: string;
  readonly focused: boolean;
  readonly theme: TerminalTheme;
}

export interface RenderNodeFocusInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
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

export interface RenderNodeHitInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
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

export interface RenderNodeRenderer<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  measure?(input: RenderNodeMeasureInput<TMessage, TKind>): Measurement;
  layout?(input: RenderNodeLayoutInput<TMessage, TKind>): readonly Rect[];
  render(input: RenderNodeRenderInput<TMessage, TKind>): void;
  accessibility?(input: RenderNodeAccessibilityInput<TMessage, TKind>): AccessibleNode;
  focusTargets?(input: RenderNodeFocusInput<TMessage, TKind>): readonly FocusTarget[];
  hitTargets?(input: RenderNodeHitInput<TMessage, TKind>): readonly HitTarget<TMessage>[];
}
