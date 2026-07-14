import type { CanvasPainter } from '../canvas.ts';
import type { BorderOptions, BorderTitle } from '../../../visual/border.ts';
import type { SurfaceVariant } from '../../../visual/surface.ts';
import type { SurfaceVisualState } from '../../../element/metadata.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export interface CanvasRenderProps {
  readonly painter: CanvasPainter;
  readonly label?: string;
}

export interface SurfaceRenderProps extends RenderNodeLayoutProps {
  readonly label?: string;
  readonly title?: BorderTitle;
  readonly variant?: SurfaceVariant;
  readonly visualState?: SurfaceVisualState;
  readonly border?: BorderOptions;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
}

export interface AbsoluteRenderProps {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
}

export type OverlayRenderProps = Record<never, never>;
