import type { TextWidthProfile } from './types.ts';

export const defaultTextWidthProfile: TextWidthProfile = Object.freeze({
  emoji: 'wide',
  ambiguous: 'narrow'
});

export function textWidthProfileKey(profile: TextWidthProfile | undefined): string {
  const resolved = profile ?? defaultTextWidthProfile;
  return `${resolved.emoji}:${resolved.ambiguous}`;
}
