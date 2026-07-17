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

export type ProtocolProbeFacts = Partial<Record<TerminalCapabilityName, boolean>>;

export interface CapabilityOverride {
  readonly support: TerminalFeatureSupport;
  readonly diagnostic?: string;
}

export type CapabilityOverrides = Partial<Record<TerminalCapabilityName, boolean | CapabilityOverride>>;

export interface TerminalCapabilityConfiguration {
  readonly probes?: ProtocolProbeFacts;
  readonly overrides?: CapabilityOverrides;
  readonly colorDepth?: 0 | 1 | 4 | 8 | 24;
}

export interface TerminalCapabilityResolverInput {
  readonly host: TerminalHostFacts;
  readonly environment?: EnvironmentFacts;
  readonly probes?: ProtocolProbeFacts;
  readonly overrides?: CapabilityOverrides;
  readonly colorDepth?: 0 | 1 | 4 | 8 | 24;
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
  const terminalSupport = protocolSupport(input);
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
      terminalSupport,
      interactiveAvailability,
      'Host cannot operate bracketed paste.',
      input,
      true
    )),
    mouseReporting: resolveCapability(input, 'mouseReporting', protocolBasis(
      terminalSupport,
      interactiveAvailability,
      'Host cannot operate mouse reporting.',
      input,
      true
    )),
    alternateScreen: resolveCapability(input, 'alternateScreen', protocolBasis(
      terminalSupport,
      outputAvailability,
      'Host cannot operate the alternate screen.',
      input,
      true
    )),
    focusReporting: resolveCapability(input, 'focusReporting', protocolBasis(
      terminalSupport,
      interactiveAvailability,
      'Host cannot operate focus reporting.',
      input,
      true
    )),
    cursorVisibility: resolveCapability(input, 'cursorVisibility', protocolBasis(
      terminalSupport,
      outputAvailability,
      'Host cannot control cursor visibility.',
      input,
      true
    )),
    synchronizedOutput: resolveCapability(input, 'synchronizedOutput', {
      support: 'unknown',
      availability: outputAvailability,
      unavailable: 'Host output cannot emit synchronized output.',
      unknown: 'Synchronized output support has not been established.',
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols), ...environmentFacts(input.environment, ['TERM', 'TERM_PROGRAM'])]
    }),
    title: resolveCapability(input, 'title', protocolBasis(
      terminalSupport,
      outputAvailability,
      'Host cannot set the terminal title.',
      input
    )),
    bell: resolveCapability(input, 'bell', protocolBasis(
      terminalSupport,
      outputAvailability,
      'Host cannot emit the terminal bell.',
      input
    )),
    clipboard: resolveCapability(input, 'clipboard', {
      support: 'unknown',
      availability: outputAvailability,
      unavailable: 'Host output cannot emit clipboard protocol.',
      unknown: 'Clipboard support requires explicit policy or evidence.',
      facts: [hostFact('terminalProtocols', input.host.terminalProtocols)]
    })
  } satisfies Record<TerminalCapabilityName, CapabilitySupport>;

  return {
    schemaVersion: 'terminal-ui.terminal-capabilities.v1',
    runtime: input.host.runtime,
    isTty: interactive,
    color: resolveColor(input),
    unicode: resolveUnicode(),
    ...capabilities,
    diagnostics: Object.values(capabilities).flatMap((item) => item.diagnostics)
  };
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
    ? probe === undefined ? basis.support : supportFromBoolean(probe)
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
  name: TerminalCapabilityName,
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
  name: TerminalCapabilityName,
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

function protocolSupport(input: TerminalCapabilityResolverInput): TerminalFeatureSupport {
  if (!input.host.outputIsTty || !input.host.terminalProtocols) return 'unsupported';
  if (input.host.runtime === 'memory') return 'supported';
  const term = env(input.environment, 'TERM');
  if (term === 'dumb') return 'unsupported';
  if (term !== undefined && term.length > 0) return 'supported';
  if (env(input.environment, 'TERM_PROGRAM') !== undefined) return 'supported';
  return 'unknown';
}

function hyperlinkSupport(input: TerminalCapabilityResolverInput): TerminalFeatureSupport {
  const program = env(input.environment, 'TERM_PROGRAM')?.toLowerCase();
  const term = env(input.environment, 'TERM')?.toLowerCase();
  if (program !== undefined && ['iterm.app', 'wezterm', 'vscode', 'apple_terminal'].includes(program)) return 'supported';
  if (term?.includes('kitty') === true || term?.includes('foot') === true) return 'supported';
  const vte = Number.parseInt(env(input.environment, 'VTE_VERSION') ?? '', 10);
  if (Number.isFinite(vte) && vte >= 5000) return 'supported';
  return protocolSupport(input) === 'unsupported' ? 'unsupported' : 'unknown';
}

function kittySupport(input: TerminalCapabilityResolverInput): TerminalFeatureSupport {
  if (protocolSupport(input) === 'unsupported') return 'unsupported';
  if (env(input.environment, 'KITTY_WINDOW_ID') !== undefined) return 'supported';
  if (env(input.environment, 'TERM')?.toLowerCase().includes('kitty') === true) return 'supported';
  return 'unknown';
}

function resolveColor(input: TerminalCapabilityResolverInput): TerminalColorCapability {
  const explicit = input.colorDepth;
  if (explicit !== undefined) return colorCapability(explicit);
  if (!input.host.outputIsTty) return colorCapability(0);
  const noColor = env(input.environment, 'NO_COLOR');
  if (noColor !== undefined && noColor.length > 0) return colorCapability(0);
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

function resolveUnicode(): TerminalUnicodeCapability {
  return { graphemeClusters: true, widthProfile: { emoji: 'wide', ambiguous: 'narrow' }, bidi: 'stable-fallback' };
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
