import type { RoutedPointerEvent } from '../input/pointer.ts';

export interface ScrollState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
  readonly followTail: boolean;
  readonly selectedIndex?: number;
}

export type ScrollAction =
  | { readonly kind: 'setContent'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'setViewport'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'setOffset'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'scrollLines'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'scrollPages'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'top' }
  | { readonly kind: 'bottom' }
  | { readonly kind: 'itemIntoView'; readonly itemIndex: number }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export type ScrollEventSource = 'wheel' | 'pointerDown' | 'dragStart' | 'drag';

export type ScrollEventTarget =
  | 'content'
  | 'verticalScrollbarTrack'
  | 'verticalScrollbarThumb'
  | 'horizontalScrollbarTrack'
  | 'horizontalScrollbarThumb';

export type ScrollWheelUnit = 'line' | 'page';

export interface ScrollWheelPolicy {
  readonly unit?: ScrollWheelUnit;
  readonly rows?: number;
  readonly columns?: number;
}

export interface ScrollPolicy {
  readonly wheel?: ScrollWheelPolicy;
}

export interface ScrollEvent {
  readonly action: ScrollAction;
  readonly scroll: ScrollState;
  readonly source: ScrollEventSource;
  readonly target: ScrollEventTarget;
  readonly pointer: RoutedPointerEvent;
}

export interface CreateScrollStateInput {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly viewportRows?: number;
  readonly viewportColumns?: number;
  readonly followTail?: boolean;
  readonly selectedIndex?: number;
}

export interface ScrollVisibleWindow {
  readonly startIndex: number;
  readonly endIndexExclusive: number;
}
