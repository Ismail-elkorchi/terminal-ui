import type { RuntimeTarget } from '../package.ts';
import type { TerminalDiagnostic, TerminalDiagnosticValue } from '../diagnostics.ts';

export type TerminalCapabilityName =
  | 'rawInput'
  | 'resize'
  | 'hyperlinks'
  | 'enhancedKeyboard'
  | 'bracketedPaste'
  | 'mouseReporting'
  | 'alternateScreen'
  | 'focusReporting'
  | 'cursorVisibility'
  | 'title'
  | 'bell'
  | 'clipboard';

export type CapabilityStatus = 'supported' | 'unavailable';
export type CapabilityConfidence = 'detected' | 'assumed' | 'forced' | 'unavailable';
export type CapabilitySourceKind = 'host' | 'environment' | 'probe' | 'override';

export interface CapabilitySourceFact {
  readonly kind: CapabilitySourceKind;
  readonly name: string;
  readonly value: TerminalDiagnosticValue;
}

export interface CapabilitySupport {
  readonly status: CapabilityStatus;
  readonly confidence: CapabilityConfidence;
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
  readonly eastAsianWidth: 'narrow' | 'wide' | 'ambiguous-narrow' | 'ambiguous-wide';
  readonly emojiWidth: 'narrow' | 'wide';
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
  readonly enhancedKeyboard: CapabilitySupport;
  readonly bracketedPaste: CapabilitySupport;
  readonly mouseReporting: CapabilitySupport;
  readonly alternateScreen: CapabilitySupport;
  readonly focusReporting: CapabilitySupport;
  readonly cursorVisibility: CapabilitySupport;
  readonly title: CapabilitySupport;
  readonly bell: CapabilitySupport;
  readonly clipboard: CapabilitySupport;
  readonly diagnostics: readonly TerminalDiagnostic[];
}
