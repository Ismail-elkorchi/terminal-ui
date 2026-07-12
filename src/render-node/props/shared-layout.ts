import type {
  LayoutAlignment,
  LayoutInsetInput,
  LayoutJustification,
  LayoutOverflow
} from '../../geometry/types.ts';

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
