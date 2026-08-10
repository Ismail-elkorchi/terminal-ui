import type { TextWidthProfile } from '../text/index.ts';

export interface TerminalOutputFeatureSupport {
  readonly support: 'supported' | 'unsupported' | 'unknown';
  readonly availability: 'available' | 'unavailable';
}

export interface TerminalOutputCapabilityProfile {
  readonly isTty: boolean;
  readonly color: {
    readonly depth: 0 | 1 | 4 | 8 | 24;
  };
  readonly unicode: {
    readonly widthProfile: TextWidthProfile;
  };
  readonly textAttributes: TerminalOutputFeatureSupport;
  readonly hyperlinks: TerminalOutputFeatureSupport;
  readonly synchronizedOutput: TerminalOutputFeatureSupport;
}

export const defaultTerminalOutputCapabilities: TerminalOutputCapabilityProfile = Object.freeze({
  isTty: false,
  color: Object.freeze({ depth: 0 }),
  unicode: Object.freeze({
    widthProfile: Object.freeze({ emoji: 'wide', ambiguous: 'narrow' })
  }),
  textAttributes: Object.freeze({ support: 'unknown', availability: 'unavailable' }),
  hyperlinks: Object.freeze({ support: 'unknown', availability: 'unavailable' }),
  synchronizedOutput: Object.freeze({ support: 'unknown', availability: 'unavailable' })
});
