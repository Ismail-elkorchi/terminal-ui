import type { CanvasPainter } from '../../contracts.ts';
import type { BorderOptions, BorderTitle } from '../../../visual/border.ts';
import type { SurfaceAppearance } from '../../../visual/surface.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export interface CanvasRenderProps {
  readonly painter: CanvasPainter;
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
