import { focusPathsEqual } from '../interaction/focus.ts';
import type {
  FocusLifecycleEvent,
  FocusPath,
  FocusTargetLifecycleEvent,
} from '../interaction/focus.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import {
  collectRenderNodeLayoutTargets,
  focusedTargetIdForLayoutNode,
} from '../renderer/internal/focus.ts';
import type { LayoutNode } from '../renderer/contracts.ts';
import type { RenderNode, RenderNodeOfKind } from '../renderer/internal/render-tree/index.ts';
import { resolveRenderNodeMessage } from '../renderer/internal/render-tree/node.ts';

interface FocusLifecycleTarget<TMessage> {
  readonly key: string;
  readonly depth: number;
  readonly renderNode: RenderNodeOfKind<TMessage, 'component'>;
  readonly targetId?: string;
}

export function focusLifecycleMessages<TMessage>(input: {
  readonly previous?: {
    readonly node: RenderNode<TMessage>;
    readonly layout: LayoutNode;
    readonly focusPath?: FocusPath;
  };
  readonly next: {
    readonly node: RenderNode<TMessage>;
    readonly layout: LayoutNode;
    readonly focusPath?: FocusPath;
  };
}): readonly TMessage[] {
  if (focusPathsEqual(input.previous?.focusPath, input.next.focusPath)) return [];
  const previous = lifecycleTargets(
    input.previous?.node,
    input.previous?.layout,
    input.previous?.focusPath,
  );
  const next = lifecycleTargets(input.next.node, input.next.layout, input.next.focusPath);
  const previousKeys = new Set(previous.map((target) => target.key));
  const nextKeys = new Set(next.map((target) => target.key));
  const previousByKey = new Map(previous.map((target) => [target.key, target]));
  const nextByKey = new Map(next.map((target) => [target.key, target]));
  const targetLeaves = previous.filter((target) => target.targetId !== undefined
    && nextByKey.get(target.key)?.targetId !== target.targetId);
  const targetEnters = next.filter((target) => target.targetId !== undefined
    && previousByKey.get(target.key)?.targetId !== target.targetId);
  return Object.freeze([
    ...targetMessagesFor(targetLeaves, 'focusTargetLeave'),
    ...messagesFor(previous.filter((target) => !nextKeys.has(target.key)), { kind: 'focusLeave' }),
    ...messagesFor(next.filter((target) => !previousKeys.has(target.key)).toReversed(), { kind: 'focusEnter' }),
    ...targetMessagesFor(targetEnters.toReversed(), 'focusTargetEnter'),
  ]);
}

function lifecycleTargets<TMessage>(
  node: RenderNode<TMessage> | undefined,
  layout: LayoutNode | undefined,
  focusPath: FocusPath | undefined,
): readonly FocusLifecycleTarget<TMessage>[] {
  if (node === undefined || layout === undefined || focusPath === undefined) return [];
  const occurrences = new Map<string, number>();
  return collectRenderNodeLayoutTargets(node, layout)
    .filter((target): target is typeof target & {
      readonly renderNode: RenderNodeOfKind<TMessage, 'component'>;
    } => target.renderNode.kind === 'component'
      && (target.renderNode.focusLifecycle !== undefined
        || target.renderNode.focusTargetLifecycle !== undefined)
      && pathStartsWith(focusPath, target.path))
    .map((target) => {
      const base = `${target.path.join('\u0000')}\u0001${target.renderNode.definition.name}\u0001${target.renderNode.id ?? ''}`;
      const occurrence = occurrences.get(base) ?? 0;
      occurrences.set(base, occurrence + 1);
      const targetId = focusedTargetIdForLayoutNode(
        target.layoutNode,
        target.path,
        focusPath,
      );
      return {
        key: `${base}\u0001${String(occurrence)}`,
        depth: target.path.length,
        renderNode: target.renderNode,
        ...(targetId === undefined ? {} : { targetId }),
      };
    })
    .toSorted((left, right) => right.depth - left.depth);
}

function targetMessagesFor<TMessage>(
  targets: readonly FocusLifecycleTarget<TMessage>[],
  kind: FocusTargetLifecycleEvent['kind'],
): readonly TMessage[] {
  return targets.flatMap((target) => {
    if (target.targetId === undefined || target.renderNode.focusTargetLifecycle === undefined) return [];
    const message = resolveRenderNodeMessage(
      target.renderNode,
      target.renderNode.focusTargetLifecycle({ kind, targetId: target.targetId }),
    );
    return isIgnoredMessage(message) ? [] : [message as TMessage];
  });
}

function messagesFor<TMessage>(
  targets: readonly FocusLifecycleTarget<TMessage>[],
  event: FocusLifecycleEvent,
): readonly TMessage[] {
  return targets.flatMap((target) => {
    if (target.renderNode.focusLifecycle === undefined) return [];
    const message = resolveRenderNodeMessage(
      target.renderNode,
      target.renderNode.focusLifecycle(event),
    );
    return isIgnoredMessage(message) ? [] : [message as TMessage];
  });
}

function pathStartsWith(path: FocusPath, prefix: FocusPath): boolean {
  return path.length >= prefix.length && prefix.every((segment, index) => path[index] === segment);
}
