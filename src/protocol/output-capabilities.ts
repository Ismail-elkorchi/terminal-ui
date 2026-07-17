import type { TextWidthProfile } from '../text/index.ts';

export interface TerminalOutputFeatureSupport {
  readonly status: 'supported' | 'unavailable';
}

export interface TerminalOutputCapabilityProfile {
  readonly isTty: boolean;
  readonly color: {
    readonly depth: 0 | 1 | 4 | 8 | 24;
  };
  readonly unicode: {
    readonly widthProfile: TextWidthProfile;
  };
  readonly hyperlinks: TerminalOutputFeatureSupport;
  readonly synchronizedOutput: TerminalOutputFeatureSupport;
}

export const defaultTerminalOutputCapabilities: TerminalOutputCapabilityProfile = Object.freeze({
  isTty: false,
  color: Object.freeze({ depth: 0 }),
  unicode: Object.freeze({
    widthProfile: Object.freeze({ emoji: 'wide', ambiguous: 'narrow' })
  }),
  hyperlinks: Object.freeze({ status: 'unavailable' }),
  synchronizedOutput: Object.freeze({ status: 'unavailable' })
});
