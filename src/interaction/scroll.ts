/** Caller-owned scroll position. Layout-derived dimensions deliberately live elsewhere. */
export interface ScrollState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly followTail: boolean;
}

export interface ScrollGeometry {
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
}

export type ScrollTransition =
  | { readonly kind: 'setOffset'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'scrollLines'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'scrollPages'; readonly rows?: number; readonly columns?: number }
  | { readonly kind: 'top' }
  | { readonly kind: 'bottom' }
  | {
    readonly kind: 'itemIntoView';
    readonly itemIndex: number;
    readonly alignment: 'nearest' | 'start' | 'center' | 'end';
  }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export type ScrollRequestSource = 'wheel' | 'pointerDown' | 'dragStart' | 'drag' | 'focus' | 'keyboard';

export type ScrollKeyboardPolicy = 'vertical' | 'horizontal' | 'both';

export type ScrollRequestTarget =
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

/** A request for the caller to accept the proposed scroll state. Raw input stays inside the runtime. */
export interface ScrollRequest {
  readonly nextState: ScrollState;
  readonly source: ScrollRequestSource;
  readonly target: ScrollRequestTarget;
}

export interface CreateScrollStateInput {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly followTail?: boolean;
}

export interface ScrollVisibleWindow {
  readonly startIndex: number;
  readonly endIndexExclusive: number;
}
