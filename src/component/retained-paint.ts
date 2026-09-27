// Only framework painters with immutable, value-based models opt into retention.
// Application callbacks and custom canvas painters are deliberately not registered.
const retained = new WeakSet<object>();

export function retainPaint<T extends object>(painter: T): T {
  retained.add(painter);
  return painter;
}

export function isRetainedPainter(painter: object): boolean {
  return retained.has(painter);
}

const styleData = new WeakMap<object, unknown>();
export function registerPaintStyle(style: object, data: unknown): void { styleData.set(style, data); }
export function paintStyleData(style: object): unknown { return styleData.get(style); }
