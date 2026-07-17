import type { PointerPresentationAction } from '../../interaction/pointer-presentation.ts';
import { pointerVisualState } from '../../interaction/pointer-presentation.ts';
import type { RenderNode } from '../model/index.ts';
import type { HitTarget } from '../model/renderer.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import { ignoreMessage, isIgnoredMessage } from '../../interaction/message.ts';

const presentationKinds = ['enter', 'leave', 'pointerDown', 'pointerUp'] as const;

export function pointerPresentationHitTargets<TMessage>(
  widget: RenderNode<TMessage>,
  bounds: HitTarget<TMessage>['bounds'],
  targets: readonly HitTarget<TMessage>[]
): readonly HitTarget<TMessage>[] {
  const toActionMessage = widget.pointer?.toActionMessage;
  if (toActionMessage === undefined) return targets;
  if (targets.length === 0 && renderNodeDisabled(widget)) return targets;
  const authoredTargets = targets.length > 0
    ? targets
    : [{
        id: `${widget.id ?? widget.kind}:root`,
        bounds,
        accepts: ['click'] as const,
        message: ignoreMessage,
        cursor: 'default' as const
      }];
  return authoredTargets.map((target) => decoratePointerTarget(target, toActionMessage));
}

export function renderNodePointerVisualState(
  widget: RenderNode,
  targetId: string
): 'hovered' | 'pressed' | undefined {
  return pointerVisualState(widget.pointer?.state, targetId);
}

export function renderNodeTargetId(widget: RenderNode, ...parts: readonly string[]): string {
  return [widget.id ?? widget.kind, ...parts].join(':');
}

export function interactionVisualState(
  widget: RenderNode,
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
  const pointer = renderNodePointerVisualState(widget, targetId);
  if (pointer === 'pressed') return 'pressed';
  if (state.selected === true) return 'selected';
  if (state.focused === true) return 'focused';
  return pointer;
}

function decoratePointerTarget<TMessage>(
  target: HitTarget<TMessage>,
  toActionMessage: (action: PointerPresentationAction) => TMessage
): HitTarget<TMessage> {
  const accepted = target.accepts ?? ['click'];
  if (!accepted.includes('click')) return target;
  return {
    ...target,
    accepts: mergeKinds(accepted, presentationKinds),
    message: (event) => {
      const presentation = pointerAction(event, target.id, toActionMessage);
      return isIgnoredMessage(presentation) ? target.message(event) : presentation;
    }
  };
}

function pointerAction<TMessage>(
  event: RoutedPointerEvent,
  targetId: string,
  toMessage: (action: PointerPresentationAction) => TMessage
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

function renderNodeDisabled(widget: RenderNode): boolean {
  return 'disabled' in widget.props && widget.props.disabled;
}
