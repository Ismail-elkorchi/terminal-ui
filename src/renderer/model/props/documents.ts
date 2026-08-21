import type { ScrollEvent, ScrollKeyboardPolicy, ScrollPolicy } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export interface ViewportRenderProps<TMessage> extends RenderNodeLayoutProps {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly keyboardScroll?: ScrollKeyboardPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
}
