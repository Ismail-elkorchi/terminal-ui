import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { FocusTarget, HitTarget, Measurement, Rect } from '../../contracts.ts';
import type { RenderNodeKind } from '../render-tree/index.ts';
import type {
  RenderNodeAccessibilityInput,
  RenderNodeFocusInput,
  RenderNodeHitInput,
  RenderNodeLayoutInput,
  RenderNodeMeasureInput,
  RenderNodePlaceInput,
  RenderNodeRenderInput
} from '../render-tree/renderer.ts';

export type StructuralRenderNodeKind = Exclude<RenderNodeKind, 'component'>;

export interface StructuralNodeRenderer<TKind extends StructuralRenderNodeKind> {
  readonly clipChildren?: boolean;
  place?<TMessage>(input: RenderNodePlaceInput<TMessage, TKind>): Rect;
  measure<TMessage>(input: RenderNodeMeasureInput<TMessage, TKind>): Measurement;
  layout?<TMessage>(input: RenderNodeLayoutInput<TMessage, TKind>): readonly Rect[];
  render<TMessage>(input: RenderNodeRenderInput<TMessage, TKind>): void;
  accessibility?<TMessage>(input: RenderNodeAccessibilityInput<TMessage, TKind>): AccessibleNode;
  focusTargets?<TMessage>(input: RenderNodeFocusInput<TMessage, TKind>): readonly FocusTarget[];
  hitTargets?<TMessage>(input: RenderNodeHitInput<TMessage, TKind>): readonly HitTarget<TMessage>[];
}

export type StructuralRendererMap<K extends StructuralRenderNodeKind> = Readonly<{
  readonly [TKind in K]: StructuralNodeRenderer<TKind>;
}>;

export type StructuralMeasurementMap<K extends StructuralRenderNodeKind> = Readonly<{
  readonly [TKind in K]: StructuralNodeRenderer<TKind>['measure'];
}>;
