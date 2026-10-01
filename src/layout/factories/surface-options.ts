import type { Element } from '../../element/types.ts';
import { toRenderNode } from '../../renderer/internal/render-tree/element.ts';

export function assertSurfaceChild<TMessage>(child: Element<TMessage>): void {
  if (Array.isArray(child) || toRenderNode(child).kind === 'surface') {
    throw new Error(
      'surface() expects exactly one non-surface child. Compose child content with column(), row(), grid(), or another layout element before wrapping it in surface().',
    );
  }
}
