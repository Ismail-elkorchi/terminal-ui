import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { FocusTarget, HitTarget, Measurement, Rect } from '../../contracts.ts';
import type { RenderNodeKind } from '../../model/index.ts';
import type {
  RenderNodeAccessibilityInput,
  RenderNodeFocusInput,
  RenderNodeHitInput,
  RenderNodeLayoutInput,
  RenderNodeMeasureInput,
  RenderNodePlaceInput,
  RenderNodeRenderInput
} from '../../model/renderer.ts';

export type BuiltinRenderNodeKind = Exclude<RenderNodeKind, 'component'>;

export interface BuiltinRenderNodeRenderer<TKind extends BuiltinRenderNodeKind> {
  readonly clipChildren?: boolean;
  place?<TMessage>(input: RenderNodePlaceInput<TMessage, TKind>): Rect;
  measure<TMessage>(input: RenderNodeMeasureInput<TMessage, TKind>): Measurement;
  layout?<TMessage>(input: RenderNodeLayoutInput<TMessage, TKind>): readonly Rect[];
  render<TMessage>(input: RenderNodeRenderInput<TMessage, TKind>): void;
  accessibility?<TMessage>(input: RenderNodeAccessibilityInput<TMessage, TKind>): AccessibleNode;
  focusTargets?<TMessage>(input: RenderNodeFocusInput<TMessage, TKind>): readonly FocusTarget[];
  hitTargets?<TMessage>(input: RenderNodeHitInput<TMessage, TKind>): readonly HitTarget<TMessage>[];
}

export type RendererMap<K extends BuiltinRenderNodeKind> = Readonly<{
  readonly [TKind in K]: BuiltinRenderNodeRenderer<TKind>;
}>;

export type RendererMeasurementMap<K extends BuiltinRenderNodeKind> = Readonly<{
  readonly [TKind in K]: BuiltinRenderNodeRenderer<TKind>['measure'];
}>;
