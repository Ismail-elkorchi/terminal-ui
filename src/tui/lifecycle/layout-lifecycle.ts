import { isIgnoredMessage } from '../../interaction/message.ts';
import { collectRenderNodeLayoutTargets } from '../../renderer/internal/focus.ts';
import { resolveRenderNodeMessage } from '../../renderer/internal/render-tree/node.ts';
import type { RenderCommitCandidate } from '../commit/runtime-frame.ts';
import type { FocusLifecycleMessage } from './focus-lifecycle.ts';

/** Read accepted layout artifacts only; never measure or lay out another tree. */
export function layoutLifecycleMessages<TMessage>(
  next: RenderCommitCandidate<TMessage>,
  previous?: RenderCommitCandidate<TMessage>,
): readonly FocusLifecycleMessage<TMessage>[] {
  const before = previous === undefined ? [] : collectRenderNodeLayoutTargets(previous.node, previous.layout);
  const byPath = new Map(before.map((target) => [JSON.stringify(target.path), target]));
  return collectRenderNodeLayoutTargets(next.node, next.layout).flatMap((target) => {
    const node = target.renderNode;
    if (node.kind !== 'component' || node.definition.renderer.onLayout === undefined) return [];
    const old = byPath.get(JSON.stringify(target.path));
    const oldNode = old?.renderNode;
    const message = resolveRenderNodeMessage(node, node.definition.renderer.onLayout({
      renderNode: node,
      layoutNode: target.layoutNode,
      theme: next.theme,
      widthProfile: next.widthProfile,
      commitId: next.commitId,
      ...(previous === undefined || old === undefined || oldNode?.kind !== 'component' || oldNode.definition.name !== node.definition.name ? {} : { previous: {
        renderNode: oldNode,
        layoutNode: old.layoutNode,
        theme: previous.theme,
        widthProfile: previous.widthProfile,
      } }),
    }));
    return isIgnoredMessage(message) ? [] : [{ message: message as TMessage, sensitiveOrigin: node.definition.sensitiveInput }];
  });
}
