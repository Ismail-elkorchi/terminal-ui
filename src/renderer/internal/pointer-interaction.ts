import type { PointerInteractionAction } from '../../interaction/pointer-interaction.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { RenderNode } from '../model/index.ts';
import type { HitTarget } from '../model/renderer.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import { ignoreMessage, isIgnoredMessage } from '../../interaction/message.ts';

const interactionKinds = ['enter', 'leave', 'pointerDown', 'pointerUp'] as const;

export function pointerInteractionHitTargets<TMessage>(
  renderNode: RenderNode<TMessage>,
  bounds: HitTarget<TMessage>['bounds'],
  targets: readonly HitTarget<TMessage>[]
): readonly HitTarget<TMessage>[] {
  const toActionMessage = renderNode.pointer?.toActionMessage;
  if (toActionMessage === undefined) return targets;
  if (targets.length === 0 && renderNodeDisabled(renderNode)) return targets;
  const authoredTargets = targets.length > 0
    ? targets
    : [{
        id: `${renderNode.id ?? renderNode.kind}:root`,
        bounds,
        accepts: ['click'] as const,
        message: ignoreMessage,
        cursor: 'default' as const
      }];
  return authoredTargets.map((target) => decoratePointerTarget(target, toActionMessage));
}

export function renderNodePointerVisualState(
  renderNode: RenderNode,
  targetId: string
): 'hovered' | 'pressed' | undefined {
  return pointerVisualState(renderNode.pointer?.state, targetId);
}

export function renderNodeTargetId(renderNode: RenderNode, ...parts: readonly string[]): string {
  return [renderNode.id ?? renderNode.kind, ...parts].join(':');
}

export function interactionVisualState(
  renderNode: RenderNode,
  targetId: string,
  state: {
    readonly disabled?: boolean;
    readonly error?: boolean;
    readonly warning?: boolean;
    readonly selected?: boolean;
    readonly focused?: boolean;
  } = {}
): import('../../element/metadata.ts').ElementVisualState | undefined {
  if (state.disabled === true) return 'disabled';
  if (state.error === true) return 'error';
  if (state.warning === true) return 'warning';
  const pointer = renderNodePointerVisualState(renderNode, targetId);
  if (pointer === 'pressed') return 'pressed';
  if (state.selected === true) return 'selected';
  if (state.focused === true) return 'focused';
  return pointer;
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
      const interaction = pointerAction(event, target.id, toActionMessage);
      return isIgnoredMessage(interaction) ? target.message(event) : interaction;
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

function renderNodeDisabled(renderNode: RenderNode): boolean {
  return 'disabled' in renderNode.props && renderNode.props.disabled;
}
