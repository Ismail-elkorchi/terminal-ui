import type { BorderOptions, BorderTitle } from '../../../../visual/border.ts';
import type { SurfaceAppearance } from '../../../../visual/surface-appearance.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfaceFit,
  AnchoredSurfacePlacement,
  AnchoredSurfaceSide
} from '../../../../interaction/anchored-surface.ts';

export interface SurfaceRenderProps extends RenderNodeLayoutProps {
  readonly title?: BorderTitle;
  readonly appearance?: SurfaceAppearance;
  readonly border?: BorderOptions;
  readonly shadow?: boolean;
}

export interface AbsoluteRenderProps {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
}

export interface AnchoredRenderProps {
  readonly anchor: AnchoredSurfaceAnchor;
  readonly placement?: AnchoredSurfacePlacement;
  readonly fallback?: readonly AnchoredSurfaceSide[];
  readonly margin?: number;
  readonly fit?: AnchoredSurfaceFit;
}

export interface PortalRenderProps<TMessage = unknown> {
  readonly anchor: AnchoredSurfaceAnchor | { readonly kind: 'allocation' };
  readonly placement?: AnchoredSurfacePlacement | 'center';
  readonly fallback?: readonly AnchoredSurfaceSide[];
  readonly margin?: number;
  readonly fit?: AnchoredSurfaceFit;
  readonly toOutsideMessage?: () => TMessage;
}
