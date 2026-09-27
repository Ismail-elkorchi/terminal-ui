import type { RenderPreparationContext } from '../contracts.ts';
import type { RenderNode } from './render-tree/types.ts';

export async function prepareRenderTree(node: RenderNode, context: RenderPreparationContext): Promise<void> {
  context.signal.throwIfAborted();
  if (node.kind === 'component') await node.definition.renderer.prepare?.({ renderNode: node, context });
  for (const child of node.children ?? []) await prepareRenderTree(child, context);
  context.signal.throwIfAborted();
}
