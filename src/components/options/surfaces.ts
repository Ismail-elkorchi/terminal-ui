import type { BorderStyle, BorderTitle } from '../../tui/border.ts';
import type { Canvas2D } from '../../tui/canvas2d/index.ts';
import type { Rect } from '../../tui/layout.ts';
import type {
  LayoutAlignment,
  LayoutInsetInput,
  LayoutJustification,
  LayoutOverflow
} from '../../tui/regions.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { SurfaceVariant } from '../../tui/surface.ts';
import type {
  ComponentKeyBindings,
  ComponentOptions,
  SurfaceVisualState
} from './base.ts';

export interface CanvasPainterInput {
  readonly canvas: Canvas2D;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export type CanvasPainter = (input: CanvasPainterInput) => void;

export interface CanvasOptions<TMessage = never> extends ComponentOptions {
  readonly painter: CanvasPainter;
  readonly label?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SurfaceOptions<TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly title?: BorderTitle;
  readonly variant?: SurfaceVariant;
  readonly visualState?: SurfaceVisualState;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
  readonly padding?: LayoutInsetInput;
  readonly margin?: LayoutInsetInput;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: LayoutAlignment;
  readonly justify?: LayoutJustification;
  readonly overflow?: LayoutOverflow;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface AbsoluteOptions<TMessage = never> extends ComponentOptions {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface OverlayOptions<TMessage = never> extends ComponentOptions {
  readonly keys?: ComponentKeyBindings<TMessage>;
}
