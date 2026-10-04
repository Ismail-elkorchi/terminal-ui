import type { TextPresentation } from '../../text/presentation.ts';
import type { LayoutNode } from '../contracts.ts';

const presentations = new WeakMap<LayoutNode, TextPresentation>();
export function retainLayoutTextPresentation(layout: LayoutNode, presentation: TextPresentation | undefined): void {
  if (presentation !== undefined) presentations.set(layout, presentation);
}
export function textPresentationForLayout(layout: LayoutNode): TextPresentation | undefined {
  return presentations.get(layout);
}
