import type {
  LayoutAlignment,
  LayoutInsetInput,
  LayoutJustification,
  LayoutOverflow
} from '../../layout/geometry.ts';

export interface RenderNodeLayoutProps {
  readonly gap?: number;
  readonly padding?: LayoutInsetInput;
  readonly margin?: LayoutInsetInput;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: LayoutAlignment;
  readonly justify?: LayoutJustification;
  readonly overflow?: LayoutOverflow;
}
