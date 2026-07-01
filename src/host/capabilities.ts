import { diagnostic } from '../diagnostics.ts';
import type { RuntimeTarget } from '../package.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  CapabilityConfidence,
  CapabilitySourceFact,
  CapabilitySupport,
  CapabilityStatus,
  TerminalCapabilityName,
  TerminalCapabilityProfile,
  TerminalColorCapability,
  TerminalUnicodeCapability
} from './capability-types.ts';

export interface TerminalHostFacts {
  readonly runtime: RuntimeTarget;
  readonly inputIsTty: boolean;
  readonly outputIsTty: boolean;
  readonly columns?: number;
  readonly rows?: number;
  readonly rawInput: boolean;
}

export interface EnvironmentFacts {
  readonly variables?: Record<string, string | undefined>;
}

export type ProtocolProbeFacts = Partial<Record<TerminalCapabilityName, boolean>>;

export interface CapabilityOverride {
  readonly status: CapabilityStatus;
  readonly diagnostic?: string;
}

export type CapabilityOverrides = Partial<Record<TerminalCapabilityName, boolean | CapabilityOverride>>;

export interface TerminalCapabilityResolverInput {
  readonly host: TerminalHostFacts;
  readonly environment?: EnvironmentFacts;
  readonly probes?: ProtocolProbeFacts;
  readonly overrides?: CapabilityOverrides;
}

export function resolveTerminalCapabilities(input: TerminalCapabilityResolverInput): TerminalCapabilityProfile {
  const inputProtocol = input.host.inputIsTty && input.host.outputIsTty;
  const outputProtocol = input.host.outputIsTty;
  const capabilities = {
    rawInput: resolveCapability(input, 'rawInput', input.host.rawInput && input.host.inputIsTty, {
      unavailable: 'Input stream cannot enter raw mode.',
      requiresSessionOperation: true,
      facts: [hostFact('rawInput', input.host.rawInput), hostFact('inputIsTty', input.host.inputIsTty)]
    }),
    resize: resolveCapability(input, 'resize', outputProtocol, {
      unavailable: 'Output stream cannot report resize events.',
      facts: [hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    hyperlinks: resolveCapability(input, 'hyperlinks', outputProtocol, {
      unavailable: 'Output stream cannot use terminal hyperlink protocol.',
      facts: [hostFact('outputIsTty', input.host.outputIsTty), ...environmentFacts(input.environment, ['TERM_PROGRAM', 'VTE_VERSION'])]
    }),
    enhancedKeyboard: resolveCapability(input, 'enhancedKeyboard', false, {
      unavailable: 'Enhanced keyboard protocol has not been detected.',
      facts: environmentFacts(input.environment, ['KITTY_WINDOW_ID', 'TERM'])
    }),
    bracketedPaste: resolveCapability(input, 'bracketedPaste', inputProtocol, {
      unavailable: 'Interactive input and output are required for bracketed paste.',
      requiresSessionOperation: true,
      facts: [hostFact('inputIsTty', input.host.inputIsTty), hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    mouseReporting: resolveCapability(input, 'mouseReporting', inputProtocol, {
      unavailable: 'Interactive input and output are required for mouse reporting.',
      requiresSessionOperation: true,
      facts: [hostFact('inputIsTty', input.host.inputIsTty), hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    alternateScreen: resolveCapability(input, 'alternateScreen', outputProtocol, {
      unavailable: 'Output stream cannot use alternate screen protocol.',
      requiresSessionOperation: true,
      facts: [hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    focusReporting: resolveCapability(input, 'focusReporting', inputProtocol, {
      unavailable: 'Interactive input and output are required for focus reporting.',
      requiresSessionOperation: true,
      facts: [hostFact('inputIsTty', input.host.inputIsTty), hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    cursorVisibility: resolveCapability(input, 'cursorVisibility', outputProtocol, {
      unavailable: 'Output stream cannot use cursor visibility protocol.',
      requiresSessionOperation: true,
      facts: [hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    title: resolveCapability(input, 'title', outputProtocol, {
      unavailable: 'Output stream cannot set terminal title.',
      facts: [hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    bell: resolveCapability(input, 'bell', outputProtocol, {
      unavailable: 'Output stream cannot use terminal bell protocol.',
      facts: [hostFact('outputIsTty', input.host.outputIsTty)]
    }),
    clipboard: resolveCapability(input, 'clipboard', false, {
      unavailable: 'Clipboard writes require explicit caller policy.',
      facts: [hostFact('outputIsTty', input.host.outputIsTty)]
    })
  } satisfies Record<TerminalCapabilityName, CapabilitySupport>;

  const diagnostics = Object.values(capabilities).flatMap((capability) => capability.diagnostics);
  return {
    schemaVersion: 'terminal-ui.terminal-capabilities.v1',
    runtime: input.host.runtime,
    isTty: inputProtocol,
    color: resolveColor(input),
    unicode: resolveUnicode(input.host),
    ...capabilities,
    diagnostics
  };
}

export function capabilityIsSupported(capability: CapabilitySupport): boolean {
  return capability.status === 'supported';
}

function resolveCapability(
  input: TerminalCapabilityResolverInput,
  name: TerminalCapabilityName,
  assumedSupported: boolean,
  options: {
    readonly unavailable: string;
    readonly requiresSessionOperation?: boolean;
    readonly facts: readonly CapabilitySourceFact[];
  }
): CapabilitySupport {
  const override = input.overrides?.[name];
  if (override !== undefined) {
    const status = typeof override === 'boolean' ? statusFromBoolean(override) : override.status;
    return capability({
      name,
      status,
      confidence: status === 'supported' ? 'forced' : 'unavailable',
      facts: [...options.facts, sourceFact('override', name, typeof override === 'boolean' ? override : override.status)],
      reason: typeof override === 'boolean' ? options.unavailable : (override.diagnostic ?? options.unavailable),
      requiresSessionOperation: options.requiresSessionOperation === true
    });
  }

  const probe = input.probes?.[name];
  if (probe !== undefined) {
    return capability({
      name,
      status: statusFromBoolean(probe),
      confidence: probe ? 'detected' : 'unavailable',
      facts: [...options.facts, sourceFact('probe', name, probe)],
      reason: options.unavailable,
      requiresSessionOperation: options.requiresSessionOperation === true
    });
  }

  return capability({
    name,
    status: statusFromBoolean(assumedSupported),
    confidence: assumedSupported ? 'assumed' : 'unavailable',
    facts: options.facts,
    reason: options.unavailable,
    requiresSessionOperation: options.requiresSessionOperation === true
  });
}

function capability(input: {
  readonly name: TerminalCapabilityName;
  readonly status: CapabilityStatus;
  readonly confidence: CapabilityConfidence;
  readonly facts: readonly CapabilitySourceFact[];
  readonly reason: string;
  readonly requiresSessionOperation: boolean;
}): CapabilitySupport {
  return {
    status: input.status,
    confidence: input.confidence,
    facts: input.facts,
    diagnostics: input.status === 'supported' ? [] : [unavailableDiagnostic(input.name, input.reason)],
    requiresSessionOperation: input.requiresSessionOperation
  };
}

function unavailableDiagnostic(name: TerminalCapabilityName, message: string): TerminalDiagnostic {
  return diagnostic('HOST_CAPABILITY_UNAVAILABLE', message, {
    severity: 'info',
    target: name,
    data: { capability: name }
  });
}

function statusFromBoolean(value: boolean): CapabilityStatus {
  return value ? 'supported' : 'unavailable';
}

function resolveColor(input: TerminalCapabilityResolverInput): TerminalColorCapability {
  if (!input.host.outputIsTty || env(input.environment, 'NO_COLOR') !== undefined) {
    return { depth: 0, hasBasicColors: false, has256Colors: false, hasTrueColor: false };
  }
  if (env(input.environment, 'COLORTERM')?.toLowerCase().includes('truecolor') === true) {
    return { depth: 24, hasBasicColors: true, has256Colors: true, hasTrueColor: true };
  }
  if (env(input.environment, 'TERM')?.includes('256color') === true) {
    return { depth: 8, hasBasicColors: true, has256Colors: true, hasTrueColor: false };
  }
  return { depth: 8, hasBasicColors: true, has256Colors: true, hasTrueColor: false };
}

function resolveUnicode(host: TerminalHostFacts): TerminalUnicodeCapability {
  return {
    graphemeClusters: true,
    eastAsianWidth: host.columns !== undefined && host.columns < 40 ? 'ambiguous-narrow' : 'narrow',
    emojiWidth: 'wide',
    bidi: 'stable-fallback'
  };
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

function environmentFacts(
  environment: EnvironmentFacts | undefined,
  names: readonly string[]
): readonly CapabilitySourceFact[] {
  return names.flatMap((name) => {
    const value = env(environment, name);
    return value === undefined ? [] : [sourceFact('environment', name, value)];
  });
}

function env(environment: EnvironmentFacts | undefined, name: string): string | undefined {
  return environment?.variables?.[name];
}
