import type { BorderOptions, BorderTitle } from '../../../visual/border.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export type DialogRenderProps = RenderNodeLayoutProps & {
  readonly title?: BorderTitle;
  readonly border?: BorderOptions;
  readonly width?: number;
  readonly height?: number;
};
