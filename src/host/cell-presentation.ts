import type { TerminalDiagnostic } from '../diagnostics.ts';
import { diagnostic } from '../diagnostics.ts';
import type { CapabilitySourceFact, CapabilitySupport, TerminalCellPresentationConfiguration, TerminalCellPresentationException } from './capability-types.ts';
import type { TerminalModeReportState } from './terminal-mode-query.ts';

export interface CellPresentationObservation {
  readonly report?: TerminalModeReportState;
  readonly conflicting?: boolean;
  readonly implicit?: boolean;
  readonly indeterminate?: boolean;
}

export interface CellPresentationResolution {
  readonly capability: CapabilitySupport;
  readonly resetRequired: boolean;
}

/** One decision for capability discovery, session acquisition and resumed sessions. */
export function resolveCellPresentation(
  input: {
    readonly cellPresentation?: TerminalCellPresentationConfiguration;
    readonly host: { readonly inputIsTty: boolean; readonly outputIsTty: boolean; readonly supportsTerminalProtocols: boolean };
    readonly environment?: { readonly variables?: Record<string, string | undefined> };
  },
  observation: CellPresentationObservation = {},
): CellPresentationResolution {
  const config = input.cellPresentation;
  const variables = input.environment?.variables ?? {};
  const conditions = presentationConditions(variables);
  const context = presentationContext(variables, conditions);
  const unresolved = conditions.filter(condition => context === null
    || !config?.exceptions?.some(exception => exception.condition === condition && exception.context === context));
  const policy = config?.policy ?? 'auto';
  const available = input.host.inputIsTty && input.host.outputIsTty && input.host.supportsTerminalProtocols;
  const facts: CapabilitySourceFact[] = [
    { kind: 'host', name: 'cellPresentation.policy', value: policy },
    { kind: 'host', name: 'cellPresentation.context', value: context },
    { kind: 'environment', name: 'cellPresentation.conditions', value: Object.freeze([...conditions]) },
    { kind: 'host', name: 'cellPresentation.evidence', value: observation.indeterminate === true ? 'indeterminate' : 'assumed' },
    { kind: 'host', name: 'cellPresentation.basis', value: 'conventional-vt-native-grid' },
    { kind: 'probe', name: 'standard:8', value: observation.report ?? null },
    ...conditions.filter(condition => !unresolved.includes(condition)).map(condition => ({
      kind: 'override' as const, name: 'cellPresentation.configurationException', value: condition,
    })),
  ];
  const issue = presentationIssue(available, variables['TERM']?.trim().toLowerCase(), observation, unresolved, policy, context !== null);
  const resetRequired = issue === undefined && observation.report === 'set';
  const reason = issue?.data?.['reason'];
  facts.push({ kind: 'host', name: 'cellPresentation.decision', value: reason ?? (resetRequired ? 'reset-required' : 'admitted') });
  return Object.freeze({ resetRequired, capability: Object.freeze({
    support: issue === undefined ? 'supported' : reason === 'terminal-unavailable' ? 'unsupported' : 'unknown',
    availability: available ? 'available' : 'unavailable', requiresSessionOperation: true,
    facts: Object.freeze(facts.map(fact => Object.freeze(fact))), diagnostics: Object.freeze(issue === undefined ? [] : [issue]),
  }) });
}

/** Reject the removed attestation option rather than silently ignoring an old safety contract. */
export function rejectLegacyCellPresentation(options: unknown): void {
  if (typeof options === 'object' && options !== null && Object.hasOwn(options, 'cellPresentation')) throw new TypeError('The top-level cellPresentation qualification option was removed; use capabilities.cellPresentation policy and scoped configuration exceptions.');
}

export function snapshotCellPresentationConfiguration(value: unknown): TerminalCellPresentationConfiguration | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).some(key => key !== 'policy' && key !== 'exceptions')) throw new TypeError('Invalid cell-presentation configuration.');
  const supplied = value as Record<string, unknown>;
  const policy = supplied['policy'];
  const exceptions = supplied['exceptions'];
  if (policy !== undefined && policy !== 'auto' && policy !== 'strict') throw new TypeError('Cell-presentation policy must be auto or strict.');
  if (exceptions !== undefined && (!Array.isArray(exceptions) || exceptions.length > 32)) throw new TypeError('Cell-presentation exceptions must be a bounded array.');
  const entries = (exceptions as readonly unknown[] | undefined)?.map(decodeException);
  return Object.freeze({ ...(policy === undefined ? {} : { policy }), ...(entries === undefined ? {} : { exceptions: Object.freeze(entries) }) });
}

function presentationContext(
  variables: Readonly<Record<string, string | undefined>>,
  conditions: readonly TerminalCellPresentationException['condition'][],
): string | null {
  if (ambiguousContext(variables, conditions)) return null;
  const fields = ['TERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'KITTY_VERSION', 'KONSOLE_VERSION'] as const;
  const identity = Object.fromEntries(fields.map(key => [key, variables[key] ?? null]));
  if (Object.values(identity).some(invalidContextValue)) return null;
  const context = JSON.stringify({ version: 1, conditions, ...identity, transport: 'direct' });
  return context.length <= 4096 ? context : null;
}

function presentationConditions(variables: Readonly<Record<string, string | undefined>>): TerminalCellPresentationException['condition'][] {
  const term = variables['TERM']?.trim().toLowerCase() ?? '';
  const program = variables['TERM_PROGRAM']?.trim().toLowerCase() ?? '';
  const conditions: TerminalCellPresentationException['condition'][] = [];
  if (term.includes('kitty') || program === 'kitty' || variables['KITTY_WINDOW_ID'] !== undefined) conditions.push('kitty-force-ltr');
  if (term.includes('konsole') || program === 'konsole' || variables['KONSOLE_VERSION'] !== undefined
    || variables['KONSOLE_DBUS_SESSION'] !== undefined) conditions.push('konsole-bidi-disabled');
  return conditions;
}

function presentationIssue(
  available: boolean,
  term: string | undefined,
  observation: CellPresentationObservation,
  unresolved: readonly TerminalCellPresentationException['condition'][],
  policy: 'auto' | 'strict',
  contextAvailable: boolean,
): TerminalDiagnostic | undefined {
  let reason: string | undefined;
  let message = '';
  let hint: string | undefined;
  if (!available || term === 'dumb') {
    reason = 'terminal-unavailable'; message = 'Interactive VT cell presentation is unavailable.';
  } else if (observation.conflicting === true) {
    reason = 'mode-reports-conflicting'; message = 'Conflicting standard-mode-8 reports cannot establish a safe presentation state.';
  } else if (observation.indeterminate === true) {
    reason = 'presentation-indeterminate'; message = 'Terminal presentation remains indeterminate after an incomplete operation or conflicting observation.';
  } else if (observation.report === 'permanently_set') {
    reason = 'bidi-mode-fixed-implicit'; message = 'Terminal standard mode 8 is permanently implicit.';
  } else if (unresolved.length > 0) {
    reason = 'terminal-configuration-required'; message = `Native cell ordering requires explicit configuration for ${unresolved.join(', ')}.`;
    hint = unresolved.includes('kitty-force-ltr')
      ? 'Set Kitty force_ltr yes in the effective terminal configuration, then explicitly remember that setting for this terminal context.'
      : 'Disable bidirectional text rendering in the effective Konsole profile, then explicitly remember that setting for this terminal context.';
    if (!contextAvailable) {
      message = 'Terminal environment hints indicate potential cell-ordering hazards, but the effective frontend configuration cannot be bound to this context.';
      hint = 'Use a directly identified terminal. Saved settings cannot safely resolve remote, shared, or conflicting-identity contexts; inherited environment hints may be stale.';
    }
  } else if (policy === 'strict') {
    reason = 'strict-proof-unavailable'; message = 'Strict cell presentation requires complete proof; mode 8 does not verify character direction, shaping, coordinates or physical arrow semantics.';
    hint = 'Use the automatic policy to accept the documented conventional native-grid assumptions.';
  } else if (observation.implicit === true && observation.report !== 'set') {
    reason = observation.report === 'unrecognized' ? 'bidi-mode-unrecognized' : 'bidi-mode-unreported'; message = 'A known implicit bidirectional mode cannot be reset without a current mutable-mode report.';
  }
  if (reason === undefined) return undefined;
  return diagnostic(
    reason === 'presentation-indeterminate' ? 'HOST_OUTPUT_INDETERMINATE'
      : reason === 'terminal-configuration-required' || reason === 'bidi-mode-fixed-implicit' || reason === 'mode-reports-conflicting'
        ? 'HOST_CELL_PRESENTATION_CONTRADICTED' : 'HOST_CAPABILITY_UNKNOWN',
    message, { severity: 'warning', target: 'cellPresentation', ...(hint === undefined ? {} : { hint }),
      data: { operation: 'cellPresentation', reason, conditions: Object.freeze([...unresolved]), contextAvailable, policy, report: observation.report ?? null } },
  );
}

function decodeException(value: unknown): TerminalCellPresentationException {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).some(key => key !== 'condition' && key !== 'context')) throw new TypeError('Invalid scoped cell-presentation exception.');
  const entry = value as Record<string, unknown>;
  const condition = entry['condition'];
  const context = entry['context'];
  if ((condition !== 'kitty-force-ltr' && condition !== 'konsole-bidi-disabled')
    || typeof context !== 'string' || context.length === 0 || context.length > 4096) throw new TypeError('Invalid scoped cell-presentation exception.');
  return Object.freeze({ condition, context });
}

function ambiguousContext(
  variables: Readonly<Record<string, string | undefined>>,
  conditions: readonly TerminalCellPresentationException['condition'][],
): boolean {
  // Shared multiplexer clients can have different outer terminals. An inner name
  // cannot bind a saved outer-terminal configuration assertion to all of them.
  if (['TMUX', 'STY', 'ZELLIJ', 'ZELLIJ_SESSION_NAME'].some(name => variables[name] !== undefined) || /^(screen|tmux)(?:[-.]|$)/iu.test(variables['TERM']?.trim() ?? '')
    || /^(tmux|screen|zellij)$/iu.test(variables['TERM_PROGRAM']?.trim() ?? '')) return true;
  const remote = ['SSH_CONNECTION', 'SSH_CLIENT', 'SSH_TTY'].some(name => variables[name] !== undefined);
  // SSH reports the connection, not the effective terminal/profile of its client.
  // Remote native-grid assumptions remain available, but saved settings need a
  // direct terminal context rather than a reusable server/IP assertion.
  if (remote) return true;
  const program = variables['TERM_PROGRAM']?.trim().toLowerCase();
  const term = variables['TERM']?.trim().toLowerCase() ?? '';
  const condition = conditions[0];
  const expectedProgram = condition === 'kitty-force-ltr' ? 'kitty' : 'konsole';
  const termIdentity = term.includes('kitty') ? 'kitty'
    : term.includes('konsole') ? 'konsole'
      : /^(?:xterm-)?(ghostty|wezterm|alacritty|foot|contour)(?:[-.]|$)/u.exec(term)?.[1];
  // Environment identity hints may be inherited or disagree. They can identify
  // hazards, but cannot positively prove which frontend/configuration is active.
  if (conditions.length > 1 || conditions.length === 1
    && (program !== undefined && program !== '' && program !== expectedProgram
      || termIdentity !== undefined && termIdentity !== expectedProgram)) return true;
  return false;
}

function invalidContextValue(value: string | null): boolean {
  if (value === null) return false;
  if (value.length > 256) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code >= 127 && code <= 159) return true;
  }
  return false;
}
