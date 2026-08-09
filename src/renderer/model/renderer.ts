import type { AccessibleNode } from '../../accessibility/index.ts';
import type {
  FocusTarget,
  HitTarget,
  LayoutNode,
  Measurement,
  RenderFocusRelation,
  RenderTarget
} from '../contracts.ts';
import type { RenderNode, RenderNodeKind, RenderNodeOfKind } from './index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { Rect } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface RenderNodeMeasureInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderNodeLayoutInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly theme: TerminalTheme;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderNodePlaceInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly theme: TerminalTheme;
  readonly measurement: () => Measurement;
  readonly childCount: number;
  readonly measureChild: (index: number) => Measurement;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderNodeRenderInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly buffer: RenderTarget;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
  readonly renderChildren: (target?: RenderTarget) => void;
}

export interface RenderNodeAccessibilityInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly id: string;
  readonly focused: boolean;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
  readonly children: readonly AccessibleNode[];
  /** Accessible output keyed by the private render node that produced it. */
  readonly accessibleNodes: ReadonlyMap<RenderNode, AccessibleNode>;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderNodeFocusInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderNodeHitInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}

export interface RenderNodeRenderer<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly clipChildren?: boolean;
  place?(input: RenderNodePlaceInput<TMessage, TKind>): Rect;
  measure(input: RenderNodeMeasureInput<TMessage, TKind>): Measurement;
  layout?(input: RenderNodeLayoutInput<TMessage, TKind>): readonly Rect[];
  render(input: RenderNodeRenderInput<TMessage, TKind>): void;
  accessibility?(input: RenderNodeAccessibilityInput<TMessage, TKind>): AccessibleNode;
  focusTargets?(input: RenderNodeFocusInput<TMessage, TKind>): readonly FocusTarget[];
  hitTargets?(input: RenderNodeHitInput<TMessage, TKind>): readonly HitTarget<TMessage>[];
}
