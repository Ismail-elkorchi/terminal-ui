import type { RuntimeTarget, TerminalCapabilityName, TerminalFeatureSupport } from './capability-types.ts';

export interface TerminalProtocolEvidence {
  readonly runtime: RuntimeTarget;
  readonly outputIsTty: boolean;
  readonly terminalProtocols: boolean;
  readonly term?: string;
  readonly termProgram?: string;
}

type InferredControlCapability = Extract<
  TerminalCapabilityName,
  'alternateScreen' | 'bell' | 'bracketedPaste' | 'cursorVisibility' | 'focusReporting' | 'mouseReporting' | 'scrollRegion' | 'title'
>;

const xtermLikeTerms = /^(?:xterm|screen|tmux|rxvt|alacritty|kitty|wezterm|foot|contour|ghostty|st)(?:[-.]|$)/u;
const basicVtTerms = /^(?:linux|vt\d+)(?:[-.]|$)/u;
const recognizedPrograms = new Set([
  'apple_terminal',
  'contour',
  'ghostty',
  'hyper',
  'iterm.app',
  'kitty',
  'rio',
  'tabby',
  'vscode',
  'warpterminal',
  'wezterm'
]);

export function inferControlCapability(
  capability: InferredControlCapability,
  evidence: TerminalProtocolEvidence
): TerminalFeatureSupport {
  const floor = protocolFloor(evidence);
  if (floor !== 'unknown') return floor;
  if (evidence.runtime === 'memory') return capability === 'scrollRegion' ? 'unknown' : 'supported';

  const term = evidence.term?.trim().toLowerCase();
  const program = evidence.termProgram?.trim().toLowerCase();
  const xtermLike = term !== undefined && xtermLikeTerms.test(term);
  const knownProgram = program !== undefined && recognizedPrograms.has(program);

  switch (capability) {
    case 'alternateScreen':
    case 'bell':
    case 'cursorVisibility':
      return xtermLike || knownProgram || (term !== undefined && basicVtTerms.test(term)) ? 'supported' : 'unknown';
    case 'bracketedPaste':
    case 'focusReporting':
    case 'mouseReporting':
    case 'scrollRegion':
    case 'title':
      return xtermLike || knownProgram ? 'supported' : 'unknown';
  }
}

export function protocolFloor(evidence: TerminalProtocolEvidence): TerminalFeatureSupport {
  if (!evidence.outputIsTty || !evidence.terminalProtocols) return 'unsupported';
  return evidence.term?.trim().toLowerCase() === 'dumb' ? 'unsupported' : 'unknown';
}
