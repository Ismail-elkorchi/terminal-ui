import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { Rect } from '../../geometry/types.ts';
import type { CursorPosition } from './cursor.ts';
import type { LayoutNode } from './layout.ts';
import type { Measurement } from './measurement.ts';
import type { RenderTarget } from './render-target.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';

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
  readonly viewport: Rect;
  readonly theme: TerminalTheme;
  readonly childMeasures: readonly Measurement[];
}

export interface RenderNodePlaceInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly theme: TerminalTheme;
}

export interface RenderNodeRenderInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RendererNode<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly buffer: RenderTarget;
  readonly theme: TerminalTheme;
  readonly focused: boolean;
  renderChildren(target?: RenderTarget): void;
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
  readonly layoutNode: LayoutNode;
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
  place?(input: RenderNodePlaceInput<TMessage, TKind>): Rect;
  measure?(input: RenderNodeMeasureInput<TMessage, TKind>): Measurement;
  layout?(input: RenderNodeLayoutInput<TMessage, TKind>): readonly Rect[];
  render(input: RenderNodeRenderInput<TMessage, TKind>): void;
  accessibility?(input: RenderNodeAccessibilityInput<TMessage, TKind>): AccessibleNode;
  focusTargets?(input: RenderNodeFocusInput<TMessage, TKind>): readonly FocusTarget[];
  hitTargets?(input: RenderNodeHitInput<TMessage, TKind>): readonly HitTarget<TMessage>[];
}
