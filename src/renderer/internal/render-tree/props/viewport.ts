import type { ScrollRequest, ScrollKeyboardPolicy, ScrollPolicy } from '../../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../../interaction/scrollbar.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export interface ViewportRenderProps<TMessage> extends RenderNodeLayoutProps {
  readonly measured?: boolean;
  readonly followTail?: boolean;
  readonly anchor?: import('../../../../interaction/scroll.ts').MeasuredViewportAnchor;
  readonly onLayout?: (layout: import('../../../../interaction/scroll.ts').MeasuredViewportLayout) => void;
  readonly constrainWidth?: boolean;
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly keyboardScroll?: ScrollKeyboardPolicy;
  readonly toScrollMessage?: (request: ScrollRequest) => TMessage;
}
