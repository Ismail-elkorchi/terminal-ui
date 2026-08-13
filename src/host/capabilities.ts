import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  CapabilitySourceFact,
  CapabilitySupport,
  HostFeatureAvailability,
  RuntimeTarget,
  TerminalCapabilityName,
  TerminalCapabilityProfile,
  TerminalColorCapability,
  TerminalFeatureSupport,
  TerminalUnicodeCapability
} from './capability-types.ts';
import type { TerminalCellPixels, TerminalGraphicsTransport } from '../protocol/index.ts';
import { defineTextWidthProfile } from '../text/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import { inferControlCapability, protocolFloor } from './protocol-evidence.ts';

export interface TerminalHostFacts {
  readonly runtime: RuntimeTarget;
  readonly inputIsTty: boolean;
  readonly outputIsTty: boolean;
  readonly columns?: number;
  readonly rows?: number;
  readonly rawInput: boolean;
  readonly resizeEvents: boolean;
  readonly terminalProtocols: boolean;
  readonly colorDepth?: 0 | 1 | 4 | 8 | 24;
}

export interface EnvironmentFacts {
  readonly variables?: Record<string, string | undefined>;
}

export type ProtocolProbeFacts = Partial<Record<TerminalCapabilityName, TerminalFeatureSupport>>;

export interface GraphicsProbeFacts {
  readonly kitty: TerminalFeatureSupport;
  readonly sixel: TerminalFeatureSupport;
  readonly kittyTransport?: TerminalGraphicsTransport;
  readonly sixelTransport?: TerminalGraphicsTransport;
  readonly cellPixels?: TerminalCellPixels;
}

export interface CapabilityOverride {
  readonly support: TerminalFeatureSupport;
  readonly diagnostic?: string;
}

export type CapabilityOverrides = Partial<Record<TerminalCapabilityName, boolean | CapabilityOverride>>;

export interface TerminalCapabilityConfiguration {
  readonly probes?: ProtocolProbeFacts;
  readonly overrides?: CapabilityOverrides;
  readonly colorDepth?: 0 | 1 | 4 | 8 | 24;
  readonly widthProfile?: TextWidthProfile;
  readonly graphics?: GraphicsProbeFacts;
}

export interface TerminalCapabilityResolverInput {
  readonly host: TerminalHostFacts;
  readonly environment?: EnvironmentFacts;
  readonly probes?: ProtocolProbeFacts;
  readonly overrides?: CapabilityOverrides;
  readonly colorDepth?: 0 | 1 | 4 | 8 | 24;
  readonly widthProfile?: TextWidthProfile;
  readonly graphics?: GraphicsProbeFacts;
}

interface CapabilityBasis {
  readonly support: TerminalFeatureSupport;
  readonly availability: HostFeatureAvailability;
  readonly unavailable: string;
  readonly unknown?: string;
  readonly requiresSessionOperation?: boolean;
  readonly facts: readonly CapabilitySourceFact[];
}

export function resolveTerminalCapabilities(input: TerminalCapabilityResolverInput): TerminalCapabilityProfile {
  const interactive = input.host.inputIsTty && input.host.outputIsTty;
  const outputAvailability = availability(input.host.outputIsTty && input.host.terminalProtocols);
  const interactiveAvailability = availability(interactive && input.host.terminalProtocols);
  const capabilities = {
    rawInput: resolveCapability(input, 'rawInput', {
      support: input.host.inputIsTty ? 'supported' : 'unsupported',
      availability: availability(input.host.rawInput && input.host.inputIsTty),
      unavailable: 'Input adapter cannot enter raw mode.',
      requiresSessionOperation: true,
      facts: [hostFact('rawInput', input.host.rawInput), hostFact('inputIsTty', input.host.inputIsTty)]
    }),
    resize: resolveCapability(input, 'resize', {
      support: input.host.outputIsTty ? 'supported' : 'unsupported',
      availability: availability(input.host.resizeEvents),
      unavailable: 'Host adapter cannot report resize events.',
      facts: [hostFact('resizeEvents', input.host.resizeEvents), hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    textAttributes: resolveCapability(input, 'textAttributes', protocolBasis(
      controlSupport(input, 'textAttributes'),
      outputAvailability,
      'Host output cannot emit terminal text attributes.',
      input
    )),
    hyperlinks: resolveCapability(input, 'hyperlinks', {
      support: hyperlinkSupport(input),
      availability: outputAvailability,
      unavailable: 'Host output cannot emit terminal hyperlinks.',
      unknown: 'Terminal hyperlink support is unknown.',
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols), ...environmentFacts(input.environment, ['TERM_PROGRAM', 'VTE_VERSION'])]
    }),
    keyboardProtocol: resolveCapability(input, 'keyboardProtocol', {
      support: kittySupport(input),
      availability: interactiveAvailability,
      unavailable: 'Host cannot negotiate an enhanced keyboard protocol.',
      unknown: 'Kitty keyboard protocol support is unknown.',
      requiresSessionOperation: true,
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols), ...environmentFacts(input.environment, ['KITTY_WINDOW_ID', 'TERM'])]
    }),
    bracketedPaste: resolveCapability(input, 'bracketedPaste', protocolBasis(
      controlSupport(input, 'bracketedPaste'),
      interactiveAvailability,
      'Host cannot operate bracketed paste.',
      input,
      true
    )),
    mouseReporting: resolveCapability(input, 'mouseReporting', protocolBasis(
      controlSupport(input, 'mouseReporting'),
      interactiveAvailability,
      'Host cannot operate mouse reporting.',
      input,
      true
    )),
    alternateScreen: resolveCapability(input, 'alternateScreen', protocolBasis(
      controlSupport(input, 'alternateScreen'),
      outputAvailability,
      'Host cannot operate the alternate screen.',
      input,
      true
    )),
    focusReporting: resolveCapability(input, 'focusReporting', protocolBasis(
      controlSupport(input, 'focusReporting'),
      interactiveAvailability,
      'Host cannot operate focus reporting.',
      input,
      true
    )),
    cursorVisibility: resolveCapability(input, 'cursorVisibility', protocolBasis(
      controlSupport(input, 'cursorVisibility'),
      outputAvailability,
      'Host cannot control cursor visibility.',
      input,
      true
    )),
    unicodeGraphemeMode: resolveCapability(input, 'unicodeGraphemeMode', {
      support: 'unknown',
      availability: outputAvailability,
      unavailable: 'Host output cannot establish terminal grapheme mode.',
      unknown: 'Terminal grapheme mode support has not been established.',
      requiresSessionOperation: true,
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols)]
    }),
    synchronizedOutput: resolveCapability(input, 'synchronizedOutput', {
      support: 'unknown',
      availability: outputAvailability,
      unavailable: 'Host output cannot emit synchronized output.',
      unknown: 'Synchronized output support has not been established.',
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols), ...environmentFacts(input.environment, ['TERM', 'TERM_PROGRAM'])]
    }),
    scrollRegion: resolveCapability(input, 'scrollRegion', protocolBasis(
      controlSupport(input, 'scrollRegion'),
      outputAvailability,
      'Host cannot operate terminal scrolling regions.',
      input
    )),
    title: resolveCapability(input, 'title', protocolBasis(
      controlSupport(input, 'title'),
      outputAvailability,
      'Host cannot set the terminal title.',
      input
    )),
    bell: resolveCapability(input, 'bell', protocolBasis(
      controlSupport(input, 'bell'),
      outputAvailability,
      'Host cannot emit the terminal bell.',
      input
    )),
    clipboardWrite: resolveCapability(input, 'clipboardWrite', {
      support: 'unknown',
      availability: outputAvailability,
      unavailable: 'Host output cannot emit clipboard-write protocol.',
      unknown: 'Clipboard-write support requires explicit policy or evidence.',
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols)]
    })
  } satisfies Record<TerminalCapabilityName, CapabilitySupport>;

  const graphics = resolveGraphics(input, outputAvailability);

  return {
    runtime: input.host.runtime,
    isTty: interactive,
    color: resolveColor(input),
    unicode: resolveUnicode(input),
    graphics,
    ...capabilities,
    diagnostics: [
      ...Object.values(capabilities).flatMap((item) => item.diagnostics),
      ...(input.graphics === undefined
        ? []
        : [...graphics.kitty.diagnostics, ...graphics.sixel.diagnostics]),
    ]
  };
}

function resolveGraphics(
  input: TerminalCapabilityResolverInput,
  outputAvailability: HostFeatureAvailability,
): TerminalCapabilityProfile['graphics'] {
  const facts = [
    hostFact('terminalProtocols', input.host.terminalProtocols),
    ...environmentFacts(input.environment, ['TERM', 'TERM_PROGRAM', 'TMUX', 'KITTY_WINDOW_ID']),
  ];
  const fallback: TerminalFeatureSupport = outputAvailability === 'available' ? 'unknown' : 'unsupported';
  const kittySupport = input.graphics?.kitty ?? fallback;
  const sixelSupport = input.graphics?.sixel ?? fallback;
  return Object.freeze({
    kitty: Object.freeze({
      ...capability(
        'kittyGraphics', kittySupport, outputAvailability,
        input.graphics === undefined ? facts : [...facts, sourceFact('probe', 'kittyGraphics', kittySupport)],
        'Kitty graphics support has not been verified.', false,
      ),
      ...(input.graphics?.kittyTransport === undefined ? {} : { transport: input.graphics.kittyTransport }),
    }),
    sixel: Object.freeze({
      ...capability(
        'sixelGraphics', sixelSupport, outputAvailability,
        input.graphics === undefined ? facts : [...facts, sourceFact('probe', 'sixelGraphics', sixelSupport)],
        'SIXEL graphics support has not been verified.', false,
      ),
      ...(input.graphics?.sixelTransport === undefined ? {} : { transport: input.graphics.sixelTransport }),
    }),
    ...(input.graphics?.cellPixels === undefined ? {} : {
      cellPixels: Object.freeze({ ...input.graphics.cellPixels }),
    }),
  });
}

export function capabilityIsSupported(capability: CapabilitySupport): boolean {
  return capability.support === 'supported' && capability.availability === 'available';
}

function resolveCapability(
  input: TerminalCapabilityResolverInput,
  name: TerminalCapabilityName,
  basis: CapabilityBasis
): CapabilitySupport {
  const override = input.overrides?.[name];
  const probe = input.probes?.[name];
  const support = override === undefined
    ? probe ?? basis.support
    : typeof override === 'boolean' ? supportFromBoolean(override) : override.support;
  const facts = [
    ...basis.facts,
    ...(probe === undefined ? [] : [sourceFact('probe', name, probe)]),
    ...(override === undefined
      ? []
      : [sourceFact('override', name, typeof override === 'boolean' ? override : override.support)])
  ];
  const message = typeof override === 'object' && override.diagnostic !== undefined
    ? override.diagnostic
    : support === 'unknown' ? (basis.unknown ?? `${name} support is unknown.`) : basis.unavailable;
  return capability(name, support, basis.availability, facts, message, basis.requiresSessionOperation === true);
}

function capability(
  name: string,
  support: TerminalFeatureSupport,
  hostAvailability: HostFeatureAvailability,
  facts: readonly CapabilitySourceFact[],
  message: string,
  requiresSessionOperation: boolean
): CapabilitySupport {
  const usable = support === 'supported' && hostAvailability === 'available';
  return {
    support,
    availability: hostAvailability,
    facts,
    diagnostics: usable ? [] : [capabilityDiagnostic(name, support, hostAvailability, message)],
    requiresSessionOperation
  };
}

function capabilityDiagnostic(
  name: string,
  support: TerminalFeatureSupport,
  hostAvailability: HostFeatureAvailability,
  message: string
): TerminalDiagnostic {
  const code = hostAvailability === 'unavailable'
    ? 'HOST_CAPABILITY_UNAVAILABLE'
    : support === 'unsupported'
      ? 'HOST_CAPABILITY_UNSUPPORTED'
      : 'HOST_CAPABILITY_UNKNOWN';
  return diagnostic(code, message, {
    severity: 'info',
    target: name,
    data: { capability: name, support, availability: hostAvailability }
  });
}

function protocolBasis(
  support: TerminalFeatureSupport,
  hostAvailability: HostFeatureAvailability,
  unavailable: string,
  input: TerminalCapabilityResolverInput,
  requiresSessionOperation = false
): CapabilityBasis {
  return {
    support,
    availability: hostAvailability,
    unavailable,
    unknown: 'Terminal protocol support is unknown.',
    requiresSessionOperation,
    facts: [
      hostFact('terminalProtocols', input.host.terminalProtocols),
      ...environmentFacts(input.environment, ['TERM', 'TERM_PROGRAM'])
    ]
  };
}

function controlSupport(
  input: TerminalCapabilityResolverInput,
  capability: Parameters<typeof inferControlCapability>[0]
): TerminalFeatureSupport {
  return inferControlCapability(capability, protocolEvidence(input));
}

function hyperlinkSupport(input: TerminalCapabilityResolverInput): TerminalFeatureSupport {
  const program = env(input.environment, 'TERM_PROGRAM')?.toLowerCase();
  const term = env(input.environment, 'TERM')?.toLowerCase();
  if (program !== undefined && ['iterm.app', 'wezterm', 'vscode', 'apple_terminal'].includes(program)) return 'supported';
  if (term?.includes('kitty') === true || term?.includes('foot') === true) return 'supported';
  const vte = Number.parseInt(env(input.environment, 'VTE_VERSION') ?? '', 10);
  if (Number.isFinite(vte) && vte >= 5000) return 'supported';
  return protocolFloor(protocolEvidence(input)) === 'unsupported' ? 'unsupported' : 'unknown';
}

function kittySupport(input: TerminalCapabilityResolverInput): TerminalFeatureSupport {
  if (protocolFloor(protocolEvidence(input)) === 'unsupported') return 'unsupported';
  if (env(input.environment, 'KITTY_WINDOW_ID') !== undefined) return 'supported';
  if (env(input.environment, 'TERM')?.toLowerCase().includes('kitty') === true) return 'supported';
  return 'unknown';
}

function protocolEvidence(input: TerminalCapabilityResolverInput): Parameters<typeof inferControlCapability>[1] {
  const term = env(input.environment, 'TERM');
  const termProgram = env(input.environment, 'TERM_PROGRAM');
  return {
    runtime: input.host.runtime,
    outputIsTty: input.host.outputIsTty,
    terminalProtocols: input.host.terminalProtocols,
    ...(term === undefined ? {} : { term }),
    ...(termProgram === undefined ? {} : { termProgram })
  };
}

function resolveColor(input: TerminalCapabilityResolverInput): TerminalColorCapability {
  const explicit = input.colorDepth;
  if (explicit !== undefined) return colorCapability(explicit);
  if (!input.host.outputIsTty) return colorCapability(0);
  const noColor = env(input.environment, 'NO_COLOR');
  if (noColor !== undefined && noColor.length > 0) return colorCapability(0);
  if (env(input.environment, 'TERM')?.toLowerCase() === 'dumb') return colorCapability(0);
  if (input.host.colorDepth !== undefined) return colorCapability(input.host.colorDepth);
  if (env(input.environment, 'COLORTERM')?.toLowerCase().includes('truecolor') === true) return colorCapability(24);
  if (env(input.environment, 'TERM')?.includes('256color') === true) return colorCapability(8);
  return colorCapability(4);
}

function colorCapability(depth: TerminalColorCapability['depth']): TerminalColorCapability {
  return {
    depth,
    hasBasicColors: depth >= 4,
    has256Colors: depth >= 8,
    hasTrueColor: depth === 24
  };
}

function resolveUnicode(input: TerminalCapabilityResolverInput): TerminalUnicodeCapability {
  return {
    graphemeClusters: true,
    widthProfile: defineTextWidthProfile(input.widthProfile),
    bidi: 'stable-fallback'
  };
}

function availability(value: boolean): HostFeatureAvailability {
  return value ? 'available' : 'unavailable';
}

function supportFromBoolean(value: boolean): TerminalFeatureSupport {
  return value ? 'supported' : 'unsupported';
}

function hostFact(name: string, value: string | number | boolean | null | undefined): CapabilitySourceFact {
  return sourceFact('host', name, value ?? null);
}

function sourceFact(
  kind: CapabilitySourceFact['kind'],
  name: string,
  value: string | number | boolean | null
): CapabilitySourceFact {
  return { kind, name, value };
}

function environmentFacts(environment: EnvironmentFacts | undefined, names: readonly string[]): readonly CapabilitySourceFact[] {
  return names.flatMap((name) => {
    const value = env(environment, name);
    return value === undefined ? [] : [sourceFact('environment', name, value)];
  });
}

function env(environment: EnvironmentFacts | undefined, name: string): string | undefined {
  return environment?.variables?.[name];
}
