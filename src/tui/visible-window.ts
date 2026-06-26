import { createScrollState, scrollReducer, visibleWindowFromScroll } from './scroll.ts';

export interface VisibleWindow {
  readonly start: number;
  readonly end: number;
}

export function visibleWindow(total: number, height: number, preferredIndex: number): VisibleWindow {
  const state = scrollReducer(
    createScrollState({ contentRows: total, viewportRows: height }),
    { kind: 'itemIntoView', index: preferredIndex }
  );
  return visibleWindowFromScroll(state);
}

export function windowDescription(kind: string, window: VisibleWindow, total: number): string {
  if (total === 0) return `Showing 0 ${kind}.`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(total)} ${kind}.`;
}
