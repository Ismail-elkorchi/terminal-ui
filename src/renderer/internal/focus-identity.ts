import type { LayoutNode } from '../contracts.ts';

const transparentFocusLayouts = new WeakSet<LayoutNode>();

export function markTransparentFocusLayout(layout: LayoutNode): LayoutNode {
  transparentFocusLayouts.add(layout);
  return layout;
}

export function hasTransparentFocusIdentity(layout: LayoutNode): boolean {
  return transparentFocusLayouts.has(layout);
}
