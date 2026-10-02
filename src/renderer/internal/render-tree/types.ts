import type {
  ElementAccessibility,
  ElementFocus,
  ElementKeyBindings,
  ElementLayer,
  ElementState,
  ElementStyles,
} from '../../../element/metadata.ts';
import type { ElementVisualState } from '../../../visual/frame-source.ts';
import type { RenderNodeKind } from '../../contracts.ts';
import type { RenderNodePropsByKind } from './props/index.ts';

export type { RenderNodeKind } from '../../contracts.ts';

interface RenderNodeBase<TMessage, TKind extends RenderNodeKind> {
  readonly id?: string;
  readonly kind: TKind;
  readonly props: RenderNodePropsByKind<TMessage>[TKind];
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles<string, Exclude<ElementVisualState, 'default'>>;
  readonly children?: readonly RenderNode<TMessage>[];
  /** Children visible to public element inspection. */
  readonly inspectionChildren?: readonly RenderNode<TMessage>[];
  /** Definition-owned semantic description adopted for public inspection. */
  readonly semanticInspection?: import("../../../element/inspection-contracts.ts").ComponentSemanticInspection
    | (() => import("../../../element/inspection-contracts.ts").ComponentSemanticInspection | undefined);
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
  readonly focusLifecycle?: (
    event: import('../../../interaction/focus.ts').FocusLifecycleEvent
  ) => unknown;
  readonly focusTargetLifecycle?: (
    event: import('../../../interaction/focus.ts').FocusTargetLifecycleEvent
  ) => unknown;
  readonly focusNavigation?: import('../../../interaction/focus.ts').FocusNavigation;
  readonly messageMap?: (message: unknown) => unknown;
  readonly accessibility?: ElementAccessibility;
  readonly focusable?: true;
  readonly state?: ElementState;
  /** Internal marker for structural nodes owned by a component implementation. */
  readonly transparentFocusIdentity?: true;
}

export type RenderNodeOfKind<
  TMessage,
  TKind extends RenderNodeKind
> = RenderNodeBase<TMessage, TKind> & (
  TKind extends 'component'
    ? { readonly definition: RuntimeComponentDefinition<TMessage> }
    : { readonly definition?: never }
);

export type RenderNode<TMessage = unknown> = {
  readonly [TKind in RenderNodeKind]: RenderNodeOfKind<TMessage, TKind>;
}[RenderNodeKind];

export type RenderNodesOfKind<TMessage, TKind extends RenderNodeKind> = {
  readonly [TCurrentKind in TKind]: RenderNodeOfKind<TMessage, TCurrentKind>;
}[TKind];

export type RenderNodeChildren<TMessage> = readonly RenderNode<TMessage>[] | RenderNode<TMessage>;
export interface RenderNodeInputMap<TMessage> {
  readonly text?: (text: string) => TMessage;
  readonly paste?: (text: string) => TMessage;
}

export interface RuntimeComponentDefinition<TMessage = unknown> {
  readonly name: string;
  readonly sensitiveInput: boolean;
  readonly inspection: import("../../../element/inspection-contracts.ts").ComponentDefinitionInspection;
  readonly renderer: RenderNodeRenderer<TMessage, 'component'>;
}

import type { AccessibleNode } from '../../../accessibility/types.ts';
import type { Rect } from '../../../geometry/types.ts';
import type { PointerInteractionState } from '../../../interaction/pointer-interaction.ts';
import type { TextWidthProfile } from '../../../text/types.ts';
import type { TerminalTheme } from '../../../theme/theme.ts';
import type {
  FocusTarget,
  HitTarget,
  LayoutNode,
  Measurement,
  RenderFocusRelation,
  RenderPreparationContext,
  RenderTarget,
} from '../../contracts.ts';

export interface RenderNodeMeasureInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly childCount: number;
  readonly measureChild: (index: number, constraints?: Rect) => Measurement;
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
  readonly measureChild: (index: number, constraints?: Rect) => Measurement;
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
  readonly measureChild: (index: number, constraints?: Rect) => Measurement;
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
  readonly pointerState?: PointerInteractionState;
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

export interface RenderNodeKeyInput<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly focus: RenderFocusRelation;
  readonly focusedTargetId?: string;
}

export interface RenderNodeLayoutCommitInput<TMessage, TKind extends RenderNodeKind> {
  readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
  readonly layoutNode: LayoutNode;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly commitId: string;
  readonly previous?: {
    readonly renderNode: RenderNodeOfKind<TMessage, TKind>;
    readonly layoutNode: LayoutNode;
    readonly theme: TerminalTheme;
    readonly widthProfile: TextWidthProfile;
  };
}

export interface RenderNodeRenderer<
  TMessage = unknown,
  TKind extends RenderNodeKind = RenderNodeKind
> {
  onLayout?(input: RenderNodeLayoutCommitInput<TMessage, TKind>): unknown;
  readonly clipChildren?: boolean;
  readonly retainPaint?: boolean;
  prepare?(input: { readonly renderNode: RenderNodeOfKind<TMessage, TKind>; readonly context: RenderPreparationContext }): Promise<void>;
  keyMap?(input: RenderNodeKeyInput<TMessage, TKind>): import('../../../element/metadata.ts').ElementKeyBindings<TMessage> | undefined;
  place?(input: RenderNodePlaceInput<TMessage, TKind>): Rect;
  measure(input: RenderNodeMeasureInput<TMessage, TKind>): Measurement;
  layout?(input: RenderNodeLayoutInput<TMessage, TKind>): readonly (Rect | null)[];
  render(input: RenderNodeRenderInput<TMessage, TKind>): void;
  accessibility?(input: RenderNodeAccessibilityInput<TMessage, TKind>): AccessibleNode;
  focusTargets?(input: RenderNodeFocusInput<TMessage, TKind>): readonly FocusTarget[];
  hitTargets?(input: RenderNodeHitInput<TMessage, TKind>): readonly HitTarget<TMessage>[];
}
