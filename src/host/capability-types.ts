import type { TerminalDiagnostic, TerminalDiagnosticValue } from '../diagnostics.ts';
import type { TextWidthProfile } from '../text/index.ts';

export type RuntimeTarget = 'node' | 'deno' | 'bun' | 'memory';

export const terminalCapabilityNames = [
  'rawInput',
  'resize',
  'hyperlinks',
  'keyboardProtocol',
  'bracketedPaste',
  'mouseReporting',
  'alternateScreen',
  'focusReporting',
  'cursorVisibility',
  'synchronizedOutput',
  'scrollRegion',
  'title',
  'bell',
  'clipboard'
] as const;

export type TerminalCapabilityName = typeof terminalCapabilityNames[number];

export type TerminalFeatureSupport = 'supported' | 'unsupported' | 'unknown';
export type HostFeatureAvailability = 'available' | 'unavailable';
export type CapabilitySourceKind = 'host' | 'environment' | 'probe' | 'override';

export interface CapabilitySourceFact {
  readonly kind: CapabilitySourceKind;
  readonly name: string;
  readonly value: TerminalDiagnosticValue;
}

export interface CapabilitySupport {
  readonly support: TerminalFeatureSupport;
  readonly availability: HostFeatureAvailability;
  readonly facts: readonly CapabilitySourceFact[];
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly requiresSessionOperation: boolean;
}

export interface TerminalColorCapability {
  readonly depth: 0 | 1 | 4 | 8 | 24;
  readonly hasBasicColors: boolean;
  readonly has256Colors: boolean;
  readonly hasTrueColor: boolean;
}

export interface TerminalUnicodeCapability {
  readonly graphemeClusters: true;
  readonly widthProfile: TextWidthProfile;
  readonly bidi: 'full' | 'stable-fallback';
}

export type TerminalCapabilityProfile = {
  readonly runtime: RuntimeTarget;
  readonly isTty: boolean;
  readonly color: TerminalColorCapability;
  readonly unicode: TerminalUnicodeCapability;
  readonly diagnostics: readonly TerminalDiagnostic[];
} & Readonly<Record<TerminalCapabilityName, CapabilitySupport>>;
