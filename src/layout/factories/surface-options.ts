import type { Element } from '../../element/index.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import { toRenderNode } from '../../renderer/internal/render-tree/element.ts';
import type { RenderNodeLayoutProps } from '../../renderer/internal/render-tree/props/shared-layout.ts';

export function surfaceLayoutProps(options: Omit<LayoutFlowOptions, 'gap'>): RenderNodeLayoutProps {
  return {
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.margin === undefined ? {} : { margin: options.margin }),
    ...(options.minWidth === undefined ? {} : { minWidth: options.minWidth }),
    ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.justify === undefined ? {} : { justify: options.justify }),
    ...(options.overflow === undefined ? {} : { overflow: options.overflow }),
  };
}

export function assertSurfaceChild<TMessage>(child: Element<TMessage>): void {
  if (Array.isArray(child) || toRenderNode(child).kind === 'surface') {
    throw new Error(
      'surface() expects exactly one non-surface child. Compose child content with column(), row(), grid(), or another layout element before wrapping it in surface().',
    );
  }
}
