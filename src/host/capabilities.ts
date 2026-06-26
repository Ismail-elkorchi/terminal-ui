import type { RuntimeTarget } from '../package.ts';
import type { TerminalCapabilities } from './types.ts';

export interface TerminalCapabilityInput {
  readonly runtime: RuntimeTarget;
  readonly inputIsTty: boolean;
  readonly outputIsTty: boolean;
  readonly columns?: number;
  readonly rawInput: boolean;
  readonly resize?: boolean;
  readonly hyperlinks?: boolean;
  readonly enhancedKeyboard?: boolean;
  readonly bracketedPaste?: boolean;
  readonly mouseReporting?: boolean;
  readonly alternateScreen?: boolean;
  readonly focusReporting?: boolean;
  readonly cursorVisibility?: boolean;
  readonly title?: boolean;
  readonly bell?: boolean;
}

export function createCapabilities(input: TerminalCapabilityInput): TerminalCapabilities {
  const interactive = input.inputIsTty && input.outputIsTty;
  const outputProtocol = input.outputIsTty;
  const inputProtocol = interactive;
  return {
    schemaVersion: 'terminal-ui.terminal-capabilities.v1',
    runtime: input.runtime,
    isTty: interactive,
    color: {
      depth: outputProtocol ? 8 : 0,
      hasBasicColors: outputProtocol,
      has256Colors: outputProtocol,
      hasTrueColor: false
    },
    unicode: {
      graphemeClusters: true,
      eastAsianWidth: input.columns !== undefined && input.columns < 40 ? 'ambiguous-narrow' : 'narrow',
      emojiWidth: 'wide',
      bidi: 'stable-fallback'
    },
    rawInput: capability(input.rawInput && input.inputIsTty, 'Input stream cannot enter raw mode.'),
    resize: capability(input.resize ?? outputProtocol, 'Output stream is not a TTY.'),
    hyperlinks: capability(input.hyperlinks ?? outputProtocol, 'Output stream is not a TTY.'),
    enhancedKeyboard: unsupported,
    bracketedPaste: capability(input.bracketedPaste ?? inputProtocol, 'Interactive input and output are required.'),
    mouseReporting: capability(input.mouseReporting ?? inputProtocol, 'Interactive input and output are required.'),
    alternateScreen: capability(input.alternateScreen ?? outputProtocol, 'Output stream is not a TTY.'),
    focusReporting: capability(input.focusReporting ?? inputProtocol, 'Interactive input and output are required.'),
    cursorVisibility: capability(input.cursorVisibility ?? outputProtocol, 'Output stream is not a TTY.'),
    title: capability(input.title ?? outputProtocol, 'Output stream is not a TTY.'),
    bell: capability(input.bell ?? outputProtocol, 'Output stream is not a TTY.'),
    diagnostics: []
  };
}

const unsupported = { supported: false, confidence: 'known' as const, reason: 'Protocol is not implemented.' };

function capability(supported: boolean, unsupportedReason: string): TerminalCapabilities['rawInput'] {
  return supported
    ? { supported: true, confidence: 'detected' }
    : { supported: false, confidence: 'known', reason: unsupportedReason };
}
