export type ChartAction =
  | { readonly kind: 'select'; readonly series: string; readonly point: number }
  | { readonly kind: 'movePoint'; readonly delta: number }
  | { readonly kind: 'pagePoints'; readonly delta: number }
  | { readonly kind: 'moveSeries'; readonly delta: number }
  | { readonly kind: 'firstPoint' }
  | { readonly kind: 'lastPoint' };

export type BarChartAction =
  | { readonly kind: 'select'; readonly id: string; readonly index: number }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string; readonly index: number };

export type HeatmapAction =
  | { readonly kind: 'select'; readonly row: number; readonly column: number }
  | { readonly kind: 'move'; readonly rows: number; readonly columns: number }
  | { readonly kind: 'pageRows'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' };
