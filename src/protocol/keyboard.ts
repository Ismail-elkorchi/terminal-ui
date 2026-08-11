/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
export interface KittyKeyboardFlagMap {
  readonly disambiguateEscapeCodes: 1;
  readonly reportEventTypes: 2;
  readonly reportAlternateKeys: 4;
  readonly reportAllKeysAsEscapeCodes: 8;
  readonly reportAssociatedText: 16;
}

export const KITTY_KEYBOARD_FLAGS: KittyKeyboardFlagMap = Object.freeze({
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16
});

export type KittyKeyboardFlags = number & { readonly __kittyKeyboardFlags: unique symbol };

export type TerminalKeyboardProfile =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'kitty'; readonly flags: KittyKeyboardFlags };

const canonicalKeyboardProfiles = new WeakSet<object>();

export const LEGACY_KEYBOARD_PROFILE: TerminalKeyboardProfile = canonicalProfile({ kind: 'legacy' });

export function kittyKeyboardFlags(value: number): KittyKeyboardFlags {
  if (!Number.isSafeInteger(value) || value < 1 || value > 31) {
    throw new RangeError('Kitty keyboard flags must be an integer between 1 and 31.');
  }
  const associatedText = (value & KITTY_KEYBOARD_FLAGS.reportAssociatedText) !== 0;
  const allKeys = (value & KITTY_KEYBOARD_FLAGS.reportAllKeysAsEscapeCodes) !== 0;
  if (associatedText && !allKeys) {
    throw new RangeError('Kitty associated text requires report-all-keys-as-escape-codes.');
  }
  return value as KittyKeyboardFlags;
}

export function kittyKeyboardProfile(flags: number): TerminalKeyboardProfile {
  return canonicalProfile({ kind: 'kitty', flags: kittyKeyboardFlags(flags) });
}

/** Decodes a profile received from serialized or independently implemented input. */
export function decodeKeyboardProfile(profile: unknown): TerminalKeyboardProfile {
  if (!isNonArrayObject(profile)) throw new TypeError('Terminal keyboard profile must be an object.');
  if (profile['kind'] === 'legacy') {
    assertExactProfileFields(profile, ['kind']);
    return LEGACY_KEYBOARD_PROFILE;
  }
  if (profile['kind'] === 'kitty' && typeof profile['flags'] === 'number') {
    assertExactProfileFields(profile, ['kind', 'flags']);
    return kittyKeyboardProfile(profile['flags']);
  }
  throw new TypeError('Terminal keyboard profile kind must be legacy or kitty.');
}

/** Canonicalizes a typed profile and enforces the Kitty flag relationship. */
export function normalizeKeyboardProfile(profile: TerminalKeyboardProfile): TerminalKeyboardProfile {
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    throw new TypeError('Terminal keyboard profile must be an object.');
  }
  if (canonicalKeyboardProfiles.has(profile)) return profile;
  if (profile.kind === 'legacy') return LEGACY_KEYBOARD_PROFILE;
  if (profile.kind === 'kitty') return kittyKeyboardProfile(profile.flags);
  throw new TypeError('Terminal keyboard profile kind must be legacy or kitty.');
}

function canonicalProfile<TProfile extends TerminalKeyboardProfile>(profile: TProfile): TProfile {
  const canonical = Object.freeze(profile);
  canonicalKeyboardProfiles.add(canonical);
  return canonical;
}

function assertExactProfileFields(
  value: Readonly<Record<string, unknown>>,
  supported: readonly string[]
): void {
  const unknown = Object.keys(value).find((field) => !supported.includes(field));
  if (unknown !== undefined) throw new TypeError(`Terminal keyboard profile contains unsupported field "${unknown}".`);
}

import { isNonArrayObject } from '../foundation/validation.ts';
