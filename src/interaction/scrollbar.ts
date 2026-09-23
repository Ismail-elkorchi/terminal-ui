export type ScrollbarVisualState = 'idle' | 'active' | 'hover' | 'disabled' | 'inactive';

export interface ScrollbarOptions {
  readonly visible?: 'auto' | 'always' | 'never';
  readonly axis?: 'vertical' | 'horizontal' | 'both';
  readonly visualState?: ScrollbarVisualState;
}

export interface ScrollbarState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
  readonly followTail: boolean;
}
