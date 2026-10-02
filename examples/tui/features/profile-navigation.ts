import { createTuiChild, updateTuiNavigation } from '@ismail-elkorchi/terminal-ui';
import type { TuiChildMessage, TuiContext, TuiNavigationScreen } from '@ismail-elkorchi/terminal-ui';
import type { NavigationStack } from '@ismail-elkorchi/terminal-ui/behavior';
import { profileFormDefinition } from './profile-form.ts';

const definition = profileFormDefinition();
type ProfileState = ReturnType<typeof definition.init>['state'];
type ProfileMessage = Parameters<typeof definition.update>[1];
interface Message { readonly kind: 'profile'; readonly child: TuiChildMessage<ProfileMessage> }
const profile = createTuiChild(definition, (child): Message => ({ kind: 'profile', child }));
type Stack = NavigationStack<TuiNavigationScreen<ProfileState>>;

/** Application-owned screen catalog: fresh generations belong to the parent. */
export function openProfile(stack: Stack, generation: number, context: TuiContext) {
  const initialized = profile.init({ id: 'profile', generation }, context);
  const screen = { child: initialized.state, focus: { kind: 'element' as const, elementId: profile.elementId(initialized.state, 'name') } };
  const next = updateTuiNavigation<ProfileState, Message>(stack, { kind: 'push', entry: { id: `profile-${String(generation)}`, state: screen } }, profile.remove);
  return { ...initialized, ...next, cancel: [...(initialized.cancel ?? []), ...(next.cancel ?? [])] };
}

export function updateProfile(stack: Stack, message: Message, context: TuiContext) {
  const index = stack.entries.findIndex(entry => entry.state.child.id === message.child.id && entry.state.child.generation === message.child.generation);
  const active = stack.entries[index];
  if (active === undefined) return { state: stack };
  const updated = profile.update(active.state.child, message.child, context);
  if (index === stack.entries.length - 1 && updated.outputs !== undefined && updated.outputs.length > 0) {
    const popped = updateTuiNavigation<ProfileState, Message, string>(stack, { kind: 'pop' }, profile.remove, updated.outputs);
    return { ...updated, ...popped, cancel: [...(updated.cancel ?? []), ...(popped.cancel ?? [])] };
  }
  if (updated.state === active.state.child) return { ...updated, state: stack };
  return { ...updated, state: { entries: stack.entries.map((entry, position) => position === index ? { ...entry, state: { ...entry.state, child: updated.state } } : entry) } };
}

export function profileView(stack: Stack, context: TuiContext) {
  const active = stack.entries.at(-1);
  return active === undefined ? null : profile.view(active.state.child, context);
}
