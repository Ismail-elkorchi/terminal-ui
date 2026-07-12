import type { CanvasPainter } from '../../ui-model/options/drawing.ts';
import type { BorderStyle, BorderTitle } from '../../tui/border.ts';
import type { SurfaceVariant } from '../../tui/surface.ts';
import type { SurfaceVisualState } from '../../element/metadata.ts';
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
  readonly border?: BorderStyle;
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
