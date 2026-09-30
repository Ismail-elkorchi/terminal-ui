import { isNonArrayObject } from '../foundation/validation.ts';
import { decodeInputTrigger } from '../input/triggers.ts';
import type { KeyboardBinding } from './key-binding.ts';

export type ControlKeymapOverrides<TAction extends string> = Readonly<
  Partial<Record<TAction, readonly KeyboardBinding[] | null>>
>;

export interface ControlKeyBinding<TAction extends string> {
  readonly action: TAction;
  readonly label: string;
  readonly binding: KeyboardBinding;
}

const controlKeymapBrand: unique symbol = Symbol('terminal-ui.controlKeymap');

export interface ControlKeymap<TAction extends string> {
  readonly [controlKeymapBrand]: true;
  readonly actions: readonly TAction[];
  readonly bindings: readonly ControlKeyBinding<TAction>[];
}

export type ControlKeymapDefaults<TAction extends string> = Readonly<Record<TAction, {
  readonly label: string;
  readonly bindings: readonly KeyboardBinding[];
}>>;

/** Resolves action overrides once. Null disables; omitted actions retain their defaults. */
export function createControlKeymap<TAction extends string>(
  defaults: ControlKeymapDefaults<TAction>,
  overrides?: ControlKeymapOverrides<TAction>,
): ControlKeymap<TAction> {
  if (overrides !== undefined && !isNonArrayObject(overrides)) throw new TypeError('Control keymap overrides must be an object.');
  const configured = overrides ?? {} as ControlKeymapOverrides<TAction>;
  for (const action of Object.keys(configured)) {
    if (!Object.hasOwn(defaults, action)) throw new TypeError(`Unknown control keymap action: ${action}.`);
  }
  const bindings: ControlKeyBinding<TAction>[] = [];
  for (const action of Object.keys(defaults) as TAction[]) {
    const specification = defaults[action];
    const selected = Object.hasOwn(configured, action) ? configured[action] : specification.bindings;
    if (selected === null) continue;
    if (!Array.isArray(selected)) throw new TypeError(`Control keymap ${action} must be an array or null.`);
    for (const value of selected) {
      const binding = decodeInputTrigger(value);
      if (binding.kind === 'text' || binding.kind === 'focus' || binding.eventType === 'release') {
        throw new TypeError('Control keymaps require keyboard press or repeat bindings.');
      }
      const conflict = bindings.find((entry) => keyboardBindingsOverlap(entry.binding, binding));
      if (conflict !== undefined) {
        throw new TypeError(`Conflicting control keymap bindings: ${conflict.action} and ${action}.`);
      }
      bindings.push(Object.freeze({ action, label: specification.label, binding }));
    }
  }
  return Object.freeze({ [controlKeymapBrand]: true as const, actions: Object.freeze(Object.keys(defaults) as TAction[]), bindings: Object.freeze(bindings) });
}

/** Derives help from the exact resolved bindings, excluding repeat-only entries. */
export function controlKeymapHelp<TAction extends string>(
  keymap: ControlKeymap<TAction>,
  actions?: readonly NoInfer<TAction>[],
): readonly { readonly binding: KeyboardBinding; readonly label: string }[] {
  return Object.freeze(keymap.bindings.filter((entry) =>
    (entry.binding.eventType ?? 'press') === 'press'
      && (actions === undefined || actions.includes(entry.action)),
  ).map(({ binding, label }) => Object.freeze({ binding, label })));
}

function keyboardBindingsOverlap(a: KeyboardBinding, b: KeyboardBinding): boolean {
  if ((a.eventType ?? 'press') !== (b.eventType ?? 'press')) return false;
  if (a.location !== undefined && b.location !== undefined && a.location !== b.location) return false;
  if (!keyboardModifiersOverlap(a, b)) return false;
  if (a.kind === 'key' && b.kind === 'key') return a.key === b.key;
  if (a.kind === 'physicalKey' && b.kind === 'physicalKey') return a.codePoint === b.codePoint;
  if (a.kind === 'codePoint' && b.kind === 'codePoint'
    && (a.source ?? 'primary') === (b.source ?? 'primary')) return a.codePoint === b.codePoint;
  // Alternate identities can describe the same physical event. Reject ambiguous
  // cross-domain combinations instead of silently choosing the first action.
  return keyboardIdentitiesMayOverlap(a, b);
}

function keyboardIdentitiesMayOverlap(a: KeyboardBinding, b: KeyboardBinding): boolean {
  if (a.kind === 'key' && b.kind === 'codePoint' && (b.source ?? 'primary') === 'primary') {
    return namedKeyMayMatchCodePoint(a.key, b.codePoint);
  }
  if (b.kind === 'key' && a.kind === 'codePoint' && (a.source ?? 'primary') === 'primary') {
    return namedKeyMayMatchCodePoint(b.key, a.codePoint);
  }
  return true;
}

/** Checks that a resolved map belongs to the control's action vocabulary. */
export function resolveControlKeymap<TAction extends string>(
  value: unknown,
  defaults: ControlKeymap<TAction>,
): ControlKeymap<TAction> {
  if (value === undefined) return defaults;
  if (!isNonArrayObject(value) || !(controlKeymapBrand in value) || value[controlKeymapBrand] !== true) {
    throw new TypeError('Control keymap must be created for this control action vocabulary.');
  }
  const keymap = value as unknown as ControlKeymap<TAction>;
  if (keymap.actions.length !== defaults.actions.length
    || keymap.actions.some((action) => !defaults.actions.includes(action))) {
    throw new TypeError('Control keymap must be created for this control action vocabulary.');
  }
  return keymap;
}

function keyboardModifiersOverlap(a: KeyboardBinding, b: KeyboardBinding): boolean {
  if (a.modifiers?.kind !== 'any' && b.modifiers?.kind !== 'any') {
    for (const modifier of ['ctrl', 'alt', 'shift', 'meta', 'super', 'hyper'] as const) {
      if ((a.modifiers?.[modifier] ?? false) !== (b.modifiers?.[modifier] ?? false)) return false;
    }
    for (const modifier of ['capsLock', 'numLock'] as const) {
      if (a.modifiers?.[modifier] !== undefined && b.modifiers?.[modifier] !== undefined
        && a.modifiers[modifier] !== b.modifiers[modifier]) return false;
    }
  }
  return true;
}

function namedKeyMayMatchCodePoint(key: string, codePoint: number): boolean {
  if (key.length === 1) return key.codePointAt(0) === codePoint;
  const controls: Readonly<Record<string, number>> = { space: 32, enter: 13, tab: 9, escape: 27, backspace: 127 };
  return controls[key] === codePoint || codePoint >= 0xe000;
}
