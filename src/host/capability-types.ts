import type { TerminalDiagnostic, TerminalDiagnosticValue } from '../diagnostics.ts';
import type { TextWidthProfile } from '../text/index.ts';

export type RuntimeTarget = 'node' | 'deno' | 'bun' | 'memory';

export type TerminalCapabilityName =
  | 'rawInput'
  | 'resize'
  | 'hyperlinks'
  | 'keyboardProtocol'
  | 'bracketedPaste'
  | 'mouseReporting'
  | 'alternateScreen'
  | 'focusReporting'
  | 'cursorVisibility'
  | 'synchronizedOutput'
  | 'title'
  | 'bell'
  | 'clipboard';

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

export interface TerminalCapabilityProfile {
  readonly schemaVersion: 'terminal-ui.terminal-capabilities.v1';
  readonly runtime: RuntimeTarget;
  readonly isTty: boolean;
  readonly color: TerminalColorCapability;
  readonly unicode: TerminalUnicodeCapability;
  readonly rawInput: CapabilitySupport;
  readonly resize: CapabilitySupport;
  readonly hyperlinks: CapabilitySupport;
  readonly keyboardProtocol: CapabilitySupport;
  readonly bracketedPaste: CapabilitySupport;
  readonly mouseReporting: CapabilitySupport;
  readonly alternateScreen: CapabilitySupport;
  readonly focusReporting: CapabilitySupport;
  readonly cursorVisibility: CapabilitySupport;
  readonly synchronizedOutput: CapabilitySupport;
  readonly title: CapabilitySupport;
  readonly bell: CapabilitySupport;
  readonly clipboard: CapabilitySupport;
  readonly diagnostics: readonly TerminalDiagnostic[];
}
