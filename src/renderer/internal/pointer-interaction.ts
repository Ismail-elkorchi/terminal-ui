import type { PointerInteractionAction } from '../../interaction/pointer-interaction.ts';
import type { RenderNode } from '../model/index.ts';
import type { HitTarget } from '../contracts.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import { ignoreMessage, isIgnoredMessage } from '../../interaction/message.ts';

const interactionKinds = ['enter', 'leave', 'pointerDown', 'pointerUp', 'pointerCancel'] as const;

export function pointerInteractionHitTargets<TMessage>(
  renderNode: RenderNode<TMessage>,
  bounds: HitTarget<TMessage>['bounds'],
  targets: readonly HitTarget<TMessage>[]
): readonly HitTarget<TMessage>[] {
  const toActionMessage = renderNode.pointer?.toActionMessage;
  if (toActionMessage === undefined) return targets;
  const interactionTargets = targets.length > 0
    ? targets
    : [{
        id: `${renderNode.id ?? renderNode.kind}:root`,
        bounds,
        accepts: ['click'] as const,
        message: ignoreMessage,
        cursor: 'default' as const
      }];
  return interactionTargets.map((target) => decoratePointerTarget(target, toActionMessage));
}

function decoratePointerTarget<TMessage>(
  target: HitTarget<TMessage>,
  toActionMessage: (action: PointerInteractionAction) => TMessage
): HitTarget<TMessage> {
  const accepted = target.accepts ?? ['click'];
  if (!accepted.includes('click')) return target;
  return {
    ...target,
    accepts: mergeKinds(accepted, interactionKinds),
    message: (event) => {
      if (event.kind === 'click') return target.message(event);
      const interaction = pointerAction(event, target.id, toActionMessage);
      return isIgnoredMessage(interaction) ? ignoreMessage() : interaction;
    }
  };
}

function pointerAction<TMessage>(
  event: RoutedPointerEvent,
  targetId: string,
  toMessage: (action: PointerInteractionAction) => TMessage
): import('../../interaction/message.ts').MessageResolution<TMessage> {
  switch (event.kind) {
    case 'enter':
      return toMessage({ kind: 'enter', targetId });
    case 'leave':
      return toMessage({ kind: 'leave', targetId });
    case 'pointerDown':
      return event.button === 'left' ? toMessage({ kind: 'press', targetId }) : ignoreMessage();
    case 'pointerUp':
    case 'pointerCancel':
      return event.button === 'left' ? toMessage({ kind: 'release', targetId }) : ignoreMessage();
    default:
      return ignoreMessage();
  }
}

function mergeKinds(
  current: readonly PointerEventKind[],
  additions: readonly PointerEventKind[]
): readonly PointerEventKind[] {
  return [...new Set([...current, ...additions])];
}
