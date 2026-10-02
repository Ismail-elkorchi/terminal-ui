import { decodeInputTrigger } from '../input/triggers.ts';
import type { SearchEntry } from '../collection/item.ts';
import type { MenuActionItem } from '../behavior/menu.ts';
import type { KeyboardBinding } from '../interaction/key-binding.ts';
import type { TuiInputBinding } from './types.ts';

/** One application-owned command, projected through existing controls and bindings. */
export interface TuiCommand<TState, TMessage> {
  readonly id: string;
  readonly label: string;
  readonly shortcuts?: readonly KeyboardBinding[];
  readonly enabled?: (state: TState) => boolean;
  readonly message: TMessage;
}

export interface TuiCommands<TState, TMessage, TCommandMessage> {
  readonly inputBindings: readonly TuiInputBinding<TState, TCommandMessage>[];
  readonly menuItems: (state: TState) => readonly MenuActionItem[];
  readonly pickerEntries: (state: TState) => readonly SearchEntry[];
  /** Call from update with current state, including activations from older frames. */
  readonly resolve: (state: TState, id: string) => TMessage | undefined;
}

/** Static command definitions; no registration, dispatch or second event lifecycle. */
export function createTuiCommands<TState, TMessage, TCommandMessage>(
  commands: readonly TuiCommand<TState, TMessage>[],
  toMessage: (id: string) => TCommandMessage,
): TuiCommands<TState, TMessage, TCommandMessage> {
  const owned = commands.map(command => Object.freeze({ ...command, shortcuts: Object.freeze((command.shortcuts ?? []).map(shortcut => decodeInputTrigger(shortcut) as KeyboardBinding)) }));
  const byId = new Map(owned.map(command => [command.id, command]));
  if (byId.size !== owned.length || owned.some(command => command.id.trim() === '')) {
    throw new TypeError('Commands require unique non-empty ids.');
  }
  const enabled = (command: TuiCommand<TState, TMessage>, state: TState) => command.enabled?.(state) ?? true;
  return Object.freeze({
    inputBindings: Object.freeze(owned.filter(command => command.shortcuts.length > 0).map(command => ({
      id: command.id, label: command.label, triggers: command.shortcuts,
      enabled: ({ state }: { readonly state: TState }) => enabled(command, state),
      message: toMessage(command.id),
    }))),
    menuItems: (state: TState) => owned.map(command => ({
      id: command.id, kind: 'action' as const, label: command.label, disabled: !enabled(command, state),
      ...(command.shortcuts[0] === undefined ? {} : { shortcut: command.shortcuts[0] }),
    })),
    pickerEntries: (state: TState) => owned.map(command => ({
      id: command.id, value: command.id, label: command.label, disabled: !enabled(command, state),
    })),
    resolve(state: TState, id: string) {
      const command = byId.get(id);
      return command === undefined || !enabled(command, state) ? undefined : command.message;
    },
  });
}
