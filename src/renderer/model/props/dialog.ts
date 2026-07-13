import type { BorderStyle } from '../../../visual/border.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export type DialogRenderProps = RenderNodeLayoutProps & {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
};
