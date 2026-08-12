import type { TextWidthProfile } from './types.ts';

export const defaultTextWidthProfile: TextWidthProfile = Object.freeze({
  emoji: 'wide',
  ambiguous: 'narrow'
});
const canonicalTextWidthProfiles = new WeakMap<object, TextWidthProfile>([
  [defaultTextWidthProfile, defaultTextWidthProfile]
]);

export function defineTextWidthProfile(profile: unknown = defaultTextWidthProfile): TextWidthProfile {
  if (typeof profile !== 'object' || profile === null) {
    throw new TypeError('Text width profile must be an object.');
  }
  const existing = canonicalTextWidthProfiles.get(profile);
  if (existing !== undefined) return existing;
  const emoji: unknown = 'emoji' in profile ? profile.emoji : undefined;
  const ambiguous: unknown = 'ambiguous' in profile ? profile.ambiguous : undefined;
  if (emoji !== 'narrow' && emoji !== 'wide') {
    throw new TypeError('Text width profile emoji must be "narrow" or "wide".');
  }
  if (ambiguous !== 'narrow' && ambiguous !== 'wide') {
    throw new TypeError('Text width profile ambiguous must be "narrow" or "wide".');
  }
  const normalized = Object.freeze({ emoji, ambiguous });
  canonicalTextWidthProfiles.set(normalized, normalized);
  return normalized;
}

export function textWidthProfileKey(profile: TextWidthProfile | undefined): string {
  const resolved = profile ?? defaultTextWidthProfile;
  return `${resolved.emoji}:${resolved.ambiguous}`;
}
