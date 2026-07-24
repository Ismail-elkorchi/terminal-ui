export type ChartAction =
  | { readonly kind: 'select'; readonly series: string; readonly pointIndex: number }
  | { readonly kind: 'movePoint'; readonly delta: number }
  | { readonly kind: 'pagePoints'; readonly delta: number }
  | { readonly kind: 'moveSeries'; readonly delta: number }
  | { readonly kind: 'firstPoint' }
  | { readonly kind: 'lastPoint' };

export type BarChartAction =
  | { readonly kind: 'select'; readonly id: string; readonly itemIndex: number }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string; readonly itemIndex: number };

export type HeatmapAction =
  | { readonly kind: 'select'; readonly rowIndex: number; readonly columnIndex: number }
  | { readonly kind: 'move'; readonly rows: number; readonly columns: number }
  | { readonly kind: 'pageRows'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' };
