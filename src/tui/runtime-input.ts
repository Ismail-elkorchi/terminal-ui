import { matchesInputTrigger } from '../input/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { FocusPath } from '../interaction/focus.ts';
import { ignoreMessage, isIgnoredMessage } from '../interaction/message.ts';
import type { MessageResolution } from '../interaction/message.ts';
import {
  findRenderNodeFocusTarget,
  renderNodeKeyChainForFocus
} from '../renderer/internal/focus.ts';
import type { LayoutNode } from '../renderer/contracts.ts';
import type { RenderNode } from '../renderer/model/types.ts';
import { resolveRenderNodeMessage } from '../renderer/model/node.ts';
import { resolveTuiInputBinding } from './input-bindings.ts';
import type { TuiInputBinding } from './types.ts';

interface RuntimeInputMessageInput<TState, TMessage> {
  readonly state: TState;
  readonly event: InputEvent;
  readonly bindings: readonly TuiInputBinding<TState, TMessage>[] | undefined;
  readonly focusPath: FocusPath | undefined;
  readonly renderNode: RenderNode<TMessage>;
  readonly layout: LayoutNode;
}

export function resolveRuntimeInputMessage<TState, TMessage>(
  input: RuntimeInputMessageInput<TState, TMessage>
): MessageResolution<TMessage> {
  const committedText = committedTextInputEvent(input.event);
  const appBinding = (
    phase: 'beforeFocus' | 'afterFocus',
    event: InputEvent
  ): MessageResolution<TMessage> => resolveTuiInputBinding({
    bindings: input.bindings,
    phase,
    state: input.state,
    event,
    focusPath: input.focusPath
  });
  const beforeFocus = appBinding('beforeFocus', input.event);
  if (!isIgnoredMessage(beforeFocus)) return beforeFocus;
  if (committedText !== undefined) {
    const beforeFocusText = appBinding('beforeFocus', committedText);
    if (!isIgnoredMessage(beforeFocusText)) return beforeFocusText;
  }
  const focused = findRenderNodeFocusTarget(input.renderNode, input.layout, input.focusPath);
  const focusedTextMessage = (
    event: Extract<InputEvent, { readonly kind: 'text' }>
  ): MessageResolution<TMessage> => {
    if (focused !== undefined) {
      const message = componentKeyMessage(focused.renderNode, event, input.focusPath);
      if (!isIgnoredMessage(message)) return message;
    }
    const handler = focused?.renderNode.inputMap?.text;
    if (handler !== undefined && focused !== undefined) {
      return resolveRenderNodeMessage(focused.renderNode, handler(event.text)) as MessageResolution<TMessage>;
    }
    return ignoreMessage();
  };
  if (input.event.kind === 'text') {
    const message = focusedTextMessage(input.event);
    if (!isIgnoredMessage(message)) return message;
  }
  if (input.event.kind === 'paste') {
    const handler = focused?.renderNode.inputMap?.paste;
    if (handler !== undefined && focused !== undefined) {
      return resolveRenderNodeMessage(focused.renderNode, handler(input.event.text)) as MessageResolution<TMessage>;
    }
  }
  if (input.event.kind === 'key') {
    for (const renderNode of renderNodeKeyChainForFocus(input.renderNode, input.layout, input.focusPath)) {
      const focusedMessage = componentKeyMessage(renderNode, input.event, input.focusPath);
      if (!isIgnoredMessage(focusedMessage)) return focusedMessage;
    }
  }
  if (committedText !== undefined) {
    const message = focusedTextMessage(committedText);
    if (!isIgnoredMessage(message)) return message;
  }
  const afterFocus = appBinding('afterFocus', input.event);
  if (!isIgnoredMessage(afterFocus)) return afterFocus;
  if (committedText !== undefined) {
    const afterFocusText = appBinding('afterFocus', committedText);
    if (!isIgnoredMessage(afterFocusText)) return afterFocusText;
  }
  return ignoreMessage();
}

export function inputEventContainsSensitiveText(event: InputEvent): boolean {
  if (event.kind === 'text' || event.kind === 'paste') return event.text.length > 0;
  if (event.kind !== 'key' || event.eventType === 'release') return false;
  if (event.committedText?.length) return true;
  if (
    event.modifiers.ctrl
    || event.modifiers.alt
    || event.modifiers.meta
    || event.modifiers.super === true
    || event.modifiers.hyper === true
  ) return false;
  return event.keyCodePoint !== undefined
    || /^[a-z0-9]$/u.test(event.key)
    || event.key === 'space';
}

export function redactSensitiveInputEvent(event: InputEvent): InputEvent {
  if (event.kind === 'paste') return { ...event, text: '[redacted]' };
  return { kind: 'text', text: '[redacted]', paste: false };
}

function committedTextInputEvent(
  event: InputEvent
): Extract<InputEvent, { readonly kind: 'text' }> | undefined {
  return event.kind === 'key'
    && event.eventType !== 'release'
    && event.committedText !== undefined
    ? { kind: 'text', text: event.committedText, paste: false }
    : undefined;
}

function componentKeyMessage<TMessage>(
  renderNode: RenderNode<TMessage>,
  event: InputEvent,
  focusPath: FocusPath | undefined
): MessageResolution<TMessage> {
  const handler = event.kind === 'key'
    ? renderNode.keyMap?.triggers?.find((binding) => matchesInputTrigger(binding.trigger, event))?.onKey
      ?? (
        event.key !== 'unknown' && event.eventType === 'press' && hasNoKeyModifiers(event)
          ? renderNode.keyMap?.[event.key]
          : undefined
      )
    : event.kind === 'text'
      ? renderNode.keyMap?.text?.[event.text]
        ?? (event.text === ' ' ? renderNode.keyMap?.space : undefined)
      : undefined;
  return handler === undefined
    ? ignoreMessage()
    : resolveRenderNodeMessage(
        renderNode,
        handler({ input: event, focusPath: focusPath ?? [] })
      ) as MessageResolution<TMessage>;
}

function hasNoKeyModifiers(event: Extract<InputEvent, { readonly kind: 'key' }>): boolean {
  return !event.modifiers.ctrl
    && !event.modifiers.alt
    && !event.modifiers.shift
    && !event.modifiers.meta
    && event.modifiers.super !== true
    && event.modifiers.hyper !== true;
}
