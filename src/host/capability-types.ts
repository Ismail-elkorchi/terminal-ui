import type { TerminalDiagnostic, TerminalDiagnosticValue } from '../diagnostics.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalCellPixels, TerminalGraphicsTransport } from '../protocol/index.ts';

export type RuntimeTarget = 'node' | 'deno' | 'bun' | 'memory';

const terminalCapabilityNameValues = [
  'rawInput',
  'resize',
  'textAttributes',
  'hyperlinks',
  'keyboardProtocol',
  'bracketedPaste',
  'mouseReporting',
  'alternateScreen',
  'focusReporting',
  'cursorVisibility',
  'unicodeGraphemeMode',
  'synchronizedOutput',
  'scrollRegion',
  'title',
  'bell',
  'clipboardWrite'
] as const;

export const terminalCapabilityNames: typeof terminalCapabilityNameValues = Object.freeze(terminalCapabilityNameValues);

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

export interface TerminalGraphicsProtocolCapability extends CapabilitySupport {
  readonly transport?: TerminalGraphicsTransport;
}

export interface TerminalGraphicsCapability {
  readonly kitty: TerminalGraphicsProtocolCapability;
  readonly sixel: TerminalGraphicsProtocolCapability;
  readonly cellPixels?: TerminalCellPixels;
}

export type TerminalCapabilityProfile = {
  readonly runtime: RuntimeTarget;
  readonly isTty: boolean;
  readonly color: TerminalColorCapability;
  readonly unicode: TerminalUnicodeCapability;
  readonly graphics: TerminalGraphicsCapability;
  readonly diagnostics: readonly TerminalDiagnostic[];
} & Readonly<Record<TerminalCapabilityName, CapabilitySupport>>;
