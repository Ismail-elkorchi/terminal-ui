export interface VisibleWindow {
  readonly start: number;
  readonly end: number;
}

export function visibleWindow(total: number, height: number, preferredIndex: number): VisibleWindow {
  if (total <= 0 || height <= 0) return { start: 0, end: 0 };
  const size = Math.min(total, Math.max(1, height));
  const normalizedPreferred = preferredIndex >= 0 && preferredIndex < total ? preferredIndex : 0;
  const centered = normalizedPreferred - Math.floor(size / 2);
  const start = Math.max(0, Math.min(centered, total - size));
  return { start, end: start + size };
}

export function windowDescription(kind: string, window: VisibleWindow, total: number): string {
  if (total === 0) return `Showing 0 ${kind}.`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(total)} ${kind}.`;
}
