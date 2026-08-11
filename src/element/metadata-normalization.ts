import type {
  ElementKeyBindings,
} from './metadata.ts';
import { inputTriggerIdentity } from '../input/index.ts';

export function mergeKeyBindings<TMessage>(
  generated: ElementKeyBindings<TMessage> | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  const mergedText = { ...(generated?.text ?? {}), ...(explicit?.text ?? {}) };
  const explicitTriggers = uniqueTriggerBindings(explicit?.triggers ?? []);
  const identities = new Set(explicitTriggers.map((binding) => inputTriggerIdentity(binding.trigger)));
  const generatedTriggers = uniqueTriggerBindings(generated?.triggers ?? [])
    .filter((binding) => !identities.has(inputTriggerIdentity(binding.trigger)));
  const triggers = [...explicitTriggers, ...generatedTriggers];
  const merged: ElementKeyBindings<TMessage> = {
    ...(generated ?? {}),
    ...(explicit ?? {}),
    ...(triggers.length === 0 ? {} : { triggers }),
    ...(Object.keys(mergedText).length === 0 ? {} : { text: mergedText })
  };
  return Object.keys(merged).length === 0 ? undefined : merged;
}

function uniqueTriggerBindings<TMessage>(
  bindings: NonNullable<ElementKeyBindings<TMessage>['triggers']>
): NonNullable<ElementKeyBindings<TMessage>['triggers']> {
  const identities = new Set<string>();
  for (const binding of bindings) {
    const identity = inputTriggerIdentity(binding.trigger);
    if (identities.has(identity)) {
      throw new TypeError(`Element key bindings contain duplicate trigger ${identity}.`);
    }
    identities.add(identity);
  }
  return bindings;
}
