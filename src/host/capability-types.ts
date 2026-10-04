import type { TerminalDiagnostic, TerminalDiagnosticValue } from '../diagnostics.ts';
import type { TerminalCellPixels } from '../protocol/graphics-geometry.ts';
import type { KittyGraphicsTransport } from '../protocol/kitty-graphics.ts';
import type { TextWidthProfile } from '../text/types.ts';

export type RuntimeTarget = 'node' | 'deno' | 'bun' | 'memory';

const terminalCapabilityNameValues = [
  'rawInput',
  'resize',
  'textAttributes',
  'hyperlinks',
  'keyboardProtocol',
  'metaSendsEscape',
  'bracketedPaste',
  'mouseReporting',
  'alternateScreen',
  'focusReporting',
  'cursorVisibility',
  'unicodeGraphemeMode',
  'cellPresentation',
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
}

export interface TerminalKittyGraphicsCapability extends CapabilitySupport {
  readonly transport?: KittyGraphicsTransport;
}

export interface TerminalGraphicsCapability {
  readonly kitty: TerminalKittyGraphicsCapability;
  readonly sixel: CapabilitySupport;
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
