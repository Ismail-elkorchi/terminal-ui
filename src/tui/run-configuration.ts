import { defaultSessionProtocolPolicy } from './session-policy.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { MouseReportingMode, TerminalHost } from '../host/index.ts';
import type { CursorVisibilityPolicy, ProtocolRequirement, SessionProtocolPolicy } from './session-policy.ts';
import type { TuiLifecyclePolicy, TuiRunInputPolicy, TuiTheme } from './types.ts';
import { decodeTerminalGraphicsMode } from '../graphics/index.ts';
import type { TerminalGraphicsMode } from '../graphics/index.ts';
import { resolveGraphicsBudgetLimits } from '../graphics/index.ts';
import type { GraphicsBudgetLimits } from '../graphics/index.ts';
import { defaultTheme } from '../theme/index.ts';
import { resolveThemeInput } from '../theme/theme.ts';

export type NormalizedTuiLifecyclePolicy = Readonly<Required<Omit<TuiLifecyclePolicy, 'defaultTimeoutMs'>>>;
import { decodeKeyboardProfile, KITTY_KEYBOARD_FLAGS } from '../protocol/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/index.ts';

export interface NormalizedTuiRunOptions<TState> {
  readonly host?: TerminalHost;
  readonly initialFocus?: InitialFocusSelector;
  readonly theme?: TuiTheme<TState>;
  readonly sessionPolicy: SessionProtocolPolicy;
  readonly lifecycle: NormalizedTuiLifecyclePolicy;
  readonly input: Readonly<Required<TuiRunInputPolicy>>;
  readonly graphics: TerminalGraphicsMode;
  readonly graphicsBudget: GraphicsBudgetLimits;
}

export const defaultTuiLifecyclePolicy: NormalizedTuiLifecyclePolicy = Object.freeze({
  startupTimeoutMs: 1_000,
  inputRetirementTimeoutMs: 1_000,
  runtimeDisposalTimeoutMs: 1_000,
  exitHandlerTimeoutMs: 1_000,
  restorationTimeoutMs: 1_000,
  outputFlushTimeoutMs: 1_000,
  hostDisposalTimeoutMs: 1_000
});

export function resolveTuiRunOptions<TState>(
  options: unknown,
): NormalizedTuiRunOptions<TState> {
  const supplied = objectValue(options, 'TUI run options');
  const host = decodeTerminalHost(supplied['host']);
  const initialFocus = decodeInitialFocus(supplied['initialFocus']);
  const theme = resolveTuiTheme<TState>(supplied['theme']);
  return Object.freeze({
    ...(host === undefined ? {} : { host }),
    ...(initialFocus === undefined ? {} : { initialFocus }),
    ...(theme === undefined ? {} : { theme }),
    sessionPolicy: resolveTuiSessionPolicy(supplied['sessionPolicy']),
    lifecycle: resolveTuiLifecyclePolicy(supplied['lifecycle']),
    input: resolveTuiInputPolicy(supplied['input']),
    graphics: decodeTerminalGraphicsMode(supplied['graphics']),
    graphicsBudget: resolveGraphicsBudgetLimits(supplied['graphicsBudget']),
  });
}

function decodeTerminalHost(value: unknown): TerminalHost | undefined {
  if (value === undefined) return undefined;
  const host = objectValue(value, 'TUI run host');
  const methods = [
    'getTerminalSize',
    'getCapabilities',
    'beginSession',
    'restoreTerminalState',
    'recoverTerminalState',
    'write',
    'writeRecovery',
    'flush',
    'dispose',
  ] as const;
  for (const method of methods) {
    if (typeof host[method] !== 'function') {
      throw new TypeError(`TUI run host ${method} must be a function.`);
    }
  }
  for (const member of ['stdin', 'stdout', 'signals', 'clock', 'env'] as const) {
    if (typeof host[member] !== 'object' || host[member] === null) {
      throw new TypeError(`TUI run host ${member} must be an object.`);
    }
  }
  if (typeof host['id'] !== 'string' || host['id'].trim() === '') {
    throw new TypeError('TUI run host id must be a non-empty string.');
  }
  if (host['runtime'] !== 'node' && host['runtime'] !== 'deno' && host['runtime'] !== 'bun' && host['runtime'] !== 'memory') {
    throw new TypeError('TUI run host runtime is invalid.');
  }
  return value as TerminalHost;
}

function resolveTuiTheme<TState>(value: unknown): TuiTheme<TState> | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'function') return value;
  return resolveThemeInput(value, defaultTheme);
}

function resolveTuiInputPolicy(value: unknown): Readonly<Required<TuiRunInputPolicy>> {
  const policy = optionalObjectValue(value, 'TUI input policy');
  const escapeDelayMs = policy?.['escapeDelayMs'] ?? 25;
  if (typeof escapeDelayMs !== 'number' || !Number.isFinite(escapeDelayMs) || escapeDelayMs < 0) {
    throw new RangeError('TUI input escapeDelayMs must be a non-negative finite number.');
  }
  return Object.freeze({ escapeDelayMs });
}

function resolveTuiLifecyclePolicy(value: unknown): NormalizedTuiLifecyclePolicy {
  const policy = optionalObjectValue(value, 'TUI lifecycle policy');
  const fallback = optionalTimeout(policy?.['defaultTimeoutMs'], 'defaultTimeoutMs');
  return Object.freeze({
    startupTimeoutMs: timeout(policy?.['startupTimeoutMs'], 'startupTimeoutMs', fallback),
    inputRetirementTimeoutMs: timeout(policy?.['inputRetirementTimeoutMs'], 'inputRetirementTimeoutMs', fallback),
    runtimeDisposalTimeoutMs: timeout(policy?.['runtimeDisposalTimeoutMs'], 'runtimeDisposalTimeoutMs', fallback),
    exitHandlerTimeoutMs: timeout(policy?.['exitHandlerTimeoutMs'], 'exitHandlerTimeoutMs', fallback),
    restorationTimeoutMs: timeout(policy?.['restorationTimeoutMs'], 'restorationTimeoutMs', fallback),
    outputFlushTimeoutMs: timeout(policy?.['outputFlushTimeoutMs'], 'outputFlushTimeoutMs', fallback),
    hostDisposalTimeoutMs: timeout(policy?.['hostDisposalTimeoutMs'], 'hostDisposalTimeoutMs', fallback)
  });
}

function timeout(value: unknown, name: keyof TuiLifecyclePolicy, fallback: number | undefined): number {
  const timeoutMs = value ?? fallback ?? defaultTuiLifecyclePolicy[name as keyof NormalizedTuiLifecyclePolicy];
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError(`TUI lifecycle ${name} must be a non-negative finite number.`);
  }
  return timeoutMs;
}

function optionalTimeout(value: unknown, name: keyof TuiLifecyclePolicy): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`TUI lifecycle ${name} must be a non-negative finite number.`);
  }
  return value;
}

function resolveTuiSessionPolicy(value: unknown): SessionProtocolPolicy {
  if (value === undefined) return defaultSessionProtocolPolicy;
  const policy = objectValue(value, 'TUI session policy');
  const keyboard = objectValue(policy['keyboard'], 'TUI session policy keyboard');
  const cursor = objectValue(policy['cursorVisibility'], 'TUI session policy cursorVisibility');
  const mouse = objectValue(policy['mouseReporting'], 'TUI session policy mouseReporting');
  const keyboardProfile = managedTuiKeyboardProfile(keyboard['profile']);
  return Object.freeze({
    alternateScreen: protocolRequirement(policy['alternateScreen'], 'alternateScreen'),
    rawInput: protocolRequirement(policy['rawInput'], 'rawInput'),
    bracketedPaste: protocolRequirement(policy['bracketedPaste'], 'bracketedPaste'),
    focusReporting: protocolRequirement(policy['focusReporting'], 'focusReporting'),
    unicodeGraphemeMode: protocolRequirement(policy['unicodeGraphemeMode'], 'unicodeGraphemeMode'),
    keyboard: Object.freeze({
      profile: keyboardProfile,
      requirement: protocolRequirement(keyboard['requirement'], 'keyboard.requirement')
    }),
    cursorVisibility: Object.freeze({
      visibility: cursorVisibility(cursor['visibility']),
      requirement: protocolRequirement(cursor['requirement'], 'cursorVisibility.requirement')
    }),
    mouseReporting: Object.freeze({
      mode: mouseReportingMode(mouse['mode']),
      requirement: protocolRequirement(mouse['requirement'], 'mouseReporting.requirement')
    })
  });
}

function managedTuiKeyboardProfile(value: unknown): TerminalKeyboardProfile {
  const profile = decodeKeyboardProfile(value);
  if (
    profile.kind === 'kitty'
    && (profile.flags & KITTY_KEYBOARD_FLAGS.reportAllKeysAsEscapeCodes) !== 0
    && (profile.flags & KITTY_KEYBOARD_FLAGS.reportAssociatedText) === 0
  ) {
    throw new RangeError(
      'Managed TUI Kitty keyboard profiles that report all keys must also report associated text.'
    );
  }
  return profile;
}

function decodeInitialFocus(value: unknown): InitialFocusSelector | undefined {
  if (value === undefined) return undefined;
  const selector = objectValue(value, 'TUI initial focus selector');
  const kind = selector['kind'];
  if (kind === 'path') {
    const path = selector['path'];
    if (!Array.isArray(path)) throw new TypeError('TUI initial focus path must be an array.');
    if (path.length === 0 || path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new TypeError('TUI initial focus path must contain non-empty string segments.');
    }
    return Object.freeze({ kind: 'path', path: Object.freeze([...path as string[]]) });
  }
  if (kind !== 'element' && kind !== 'elementTarget') {
    throw new TypeError('TUI initial focus selector kind is invalid.');
  }
  const elementId = nonEmptyString(selector['elementId'], 'elementId');
  if (kind === 'element') return Object.freeze({ kind, elementId });
  return Object.freeze({
    kind,
    elementId,
    targetId: nonEmptyString(selector['targetId'], 'targetId')
  });
}

function protocolRequirement(
  value: unknown,
  name: string
): ProtocolRequirement {
  if (value === 'required' || value === 'optional' || value === 'disabled') return value;
  throw new TypeError(`TUI session policy ${name} is invalid.`);
}

function cursorVisibility(value: unknown): CursorVisibilityPolicy {
  if (value === 'hide' || value === 'show' || value === 'unchanged') return value;
  throw new TypeError('TUI session policy cursorVisibility.visibility is invalid.');
}

function mouseReportingMode(value: unknown): MouseReportingMode {
  if (value === 'none' || value === 'click' || value === 'drag' || value === 'all') return value;
  throw new TypeError('TUI session policy mouseReporting.mode is invalid.');
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`TUI initial focus ${name} must be non-empty.`);
  }
  return value;
}

function objectValue(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function optionalObjectValue(
  value: unknown,
  subject: string,
): Readonly<Record<string, unknown>> | undefined {
  return value === undefined ? undefined : objectValue(value, subject);
}
