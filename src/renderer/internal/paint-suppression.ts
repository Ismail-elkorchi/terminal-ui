import type { LayoutNode } from '../contracts.ts';

// Paint is independent of layout visibility and interaction. Store the resolved
// value on the layout's immutable layer identity so focus targets share it too.
const suppressedLayers = new WeakSet<LayoutNode['layer']>();

export function retainPaintSuppression(layout: LayoutNode, suppressed: boolean): void {
  if (suppressed) suppressedLayers.add(layout.layer);
}

export function paintSuppressed(target: Pick<LayoutNode, 'layer'>): boolean {
  return suppressedLayers.has(target.layer);
}
