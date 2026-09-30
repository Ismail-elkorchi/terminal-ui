import type { KeyboardBinding } from '../../interaction/key-binding.ts';
import { isIgnoredMessage } from '../../interaction/message.ts';
import type { ElementKeyBindings, ElementKeyHandler } from '../../element/metadata.ts';
import type { ControlKeymap } from '../../interaction/control-keymap.ts';

/** Bind existing semantic handlers only; focus routing remains the runtime's job. */
export function controlKeyBindings<TAction extends string, TMessage>(
  keymap: ControlKeymap<TAction>,
  handlers: Readonly<Partial<Record<TAction, ElementKeyHandler<TMessage>>>>,
): ElementKeyBindings<TMessage> {
  const text: Record<string, ElementKeyHandler<TMessage>> = {};
  const triggers = keymap.bindings.flatMap(({ action, binding }) => {
    const onKey = handlers[action];
    if (onKey === undefined) return [];
    const character = legacyTextBinding(binding);
    if (character !== undefined) text[character] = onKey;
    return [{ trigger: binding, onKey }];
  });
  return { triggers, text };

}

export function mapControlKeyHandlers<TAction extends string, TInput, TOutput>(
  handlers: Readonly<Partial<Record<TAction, ElementKeyHandler<TInput>>>>,
  map: (message: TInput) => TOutput,
): Readonly<Partial<Record<TAction, ElementKeyHandler<TOutput>>>> {
  return Object.fromEntries(Object.entries(handlers).map(([action, candidate]) => {
    const handler = candidate as ElementKeyHandler<TInput>;
    return [action, (event: Parameters<typeof handler>[0]) => {
      const result = handler(event);
      return isIgnoredMessage(result) ? result : map(result);
    }];
  })) as Readonly<Partial<Record<TAction, ElementKeyHandler<TOutput>>>>;
}

function legacyTextBinding(binding: KeyboardBinding): string | undefined {
  if ((binding.eventType ?? 'press') !== 'press' || binding.location !== undefined) return undefined;
  const modifiers = binding.modifiers;
  if (modifiers?.kind === 'any' || (modifiers !== undefined && Object.entries(modifiers)
    .some(([name, value]) => name !== 'kind' && value !== false))) return undefined;
  if (binding.kind === 'key') return binding.key === 'space' ? ' ' : binding.key.length === 1 ? binding.key : undefined;
  if (binding.kind === 'codePoint' && (binding.source ?? 'primary') === 'primary' && binding.codePoint >= 32) {
    return String.fromCodePoint(binding.codePoint);
  }
  return undefined;
}
