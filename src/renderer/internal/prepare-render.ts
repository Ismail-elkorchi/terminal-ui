import { prepareRenderModel } from '../../foundation/render-preparation.ts';
import type { RenderPreparationContext } from '../../foundation/render-preparation.ts';
import type { RenderNode } from './render-tree/index.ts';

export async function prepareRenderTree(node: RenderNode, context: RenderPreparationContext): Promise<void> {
  context.signal.throwIfAborted();
  if (node.kind === 'component') await prepareRenderModel(node.props.model as object, context);
  for (const child of node.children ?? []) await prepareRenderTree(child, context);
  context.signal.throwIfAborted();
}
