import type { CanvasPainter } from '../canvas.ts';
import type { BorderOptions, BorderTitle } from '../../../visual/border.ts';
import type { SurfaceAppearance, SurfaceCondition } from '../../../visual/surface.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export interface CanvasRenderProps {
  readonly painter: CanvasPainter;
  readonly label?: string;
}

export interface SurfaceRenderProps extends RenderNodeLayoutProps {
  readonly label?: string;
  readonly title?: BorderTitle;
  readonly appearance?: SurfaceAppearance;
  readonly condition?: SurfaceCondition;
  readonly border?: BorderOptions;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
  readonly focusWithin?: boolean;
}

export interface AbsoluteRenderProps {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
}

export type OverlayRenderProps = Record<never, never>;
