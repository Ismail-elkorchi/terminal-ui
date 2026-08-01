import type { CanvasPainter, Measurement } from '../../contracts.ts';
import type { BorderOptions, BorderTitle } from '../../../visual/border.ts';
import type { SurfaceAppearance } from '../../../visual/surface.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfacePlacement,
  AnchoredSurfaceSide
} from '../../../interaction/anchored-surface.ts';

export interface CanvasRenderProps {
  readonly painter: CanvasPainter;
  readonly measurement: Measurement;
  readonly label?: string;
}

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
}
