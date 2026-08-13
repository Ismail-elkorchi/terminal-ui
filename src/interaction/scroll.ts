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

export type ScrollAction =
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

/** A semantic scroll transition. The routed pointer event stays inside the runtime. */
export interface ScrollEvent {
  readonly action: ScrollAction;
  readonly state: ScrollState;
  readonly source: ScrollEventSource;
  readonly target: ScrollEventTarget;
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
