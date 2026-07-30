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
    const handler = focused?.renderNode.inputMap?.text;
    if (handler !== undefined) return handler(event.text);
    for (const renderNode of renderNodeKeyChainForFocus(input.renderNode, input.layout, input.focusPath)) {
      const message = componentKeyMessage(renderNode.keyMap, event, input.focusPath);
      if (!isIgnoredMessage(message)) return message;
    }
    return ignoreMessage();
  };
  if (input.event.kind === 'text') {
    const message = focusedTextMessage(input.event);
    if (!isIgnoredMessage(message)) return message;
  }
  if (input.event.kind === 'paste') {
    const handler = focused?.renderNode.inputMap?.paste;
    if (handler !== undefined) return handler(input.event.text);
  }
  for (const renderNode of renderNodeKeyChainForFocus(input.renderNode, input.layout, input.focusPath)) {
    const focusedMessage = componentKeyMessage(renderNode.keyMap, input.event, input.focusPath);
    if (!isIgnoredMessage(focusedMessage)) return focusedMessage;
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
  if (event.modifiers.ctrl || event.modifiers.alt || event.modifiers.meta) return false;
  return event.committedText !== undefined
    || event.keyCodePoint !== undefined
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
  keyMap: RenderNode<TMessage>['keyMap'] | undefined,
  event: InputEvent,
  focusPath: FocusPath | undefined
): MessageResolution<TMessage> {
  const handler = event.kind === 'key' && event.key !== 'unknown'
    ? keyMap?.triggers?.find((binding) => matchesInputTrigger(binding.trigger, event))?.onKey
      ?? (hasNoKeyModifiers(event) ? keyMap?.[event.key] : undefined)
    : event.kind === 'text'
      ? keyMap?.text?.[event.text]
      : undefined;
  return handler === undefined
    ? ignoreMessage()
    : handler({ input: event, focusPath: focusPath ?? [] });
}

function hasNoKeyModifiers(event: Extract<InputEvent, { readonly kind: 'key' }>): boolean {
  return !event.modifiers.ctrl
    && !event.modifiers.alt
    && !event.modifiers.shift
    && !event.modifiers.meta;
}
