/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
import { defaultSessionProtocolPolicy } from './session-policy.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { MouseReportingMode } from '../host/index.ts';
import type { CursorVisibilityPolicy, ProtocolRequirement, SessionProtocolPolicy } from './session-policy.ts';
import type { TuiLifecyclePolicy, TuiRunInputPolicy, TuiRunOptions, TuiTheme } from './types.ts';

export type NormalizedTuiLifecyclePolicy = Readonly<Required<Omit<TuiLifecyclePolicy, 'defaultTimeoutMs'>>>;
import { normalizeKeyboardProfile } from '../protocol/index.ts';

export interface NormalizedTuiRunOptions<TState> {
  readonly initialFocus?: InitialFocusSelector;
  readonly theme?: TuiTheme<TState>;
  readonly sessionPolicy: SessionProtocolPolicy;
  readonly lifecycle: NormalizedTuiLifecyclePolicy;
  readonly input: Readonly<Required<TuiRunInputPolicy>>;
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

export function normalizeTuiRunOptions<TState>(
  options: TuiRunOptions<TState>
): NormalizedTuiRunOptions<TState> {
  const initialFocus = normalizeInitialFocus(options.initialFocus);
  return Object.freeze({
    ...(initialFocus === undefined ? {} : { initialFocus }),
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    sessionPolicy: normalizeSessionPolicy(options.sessionPolicy),
    lifecycle: normalizeLifecyclePolicy(options.lifecycle),
    input: normalizeInputPolicy(options.input)
  });
}

function normalizeInputPolicy(policy: TuiRunInputPolicy | undefined): Readonly<Required<TuiRunInputPolicy>> {
  const escapeDelayMs = policy?.escapeDelayMs ?? 25;
  if (!Number.isFinite(escapeDelayMs) || escapeDelayMs < 0) {
    throw new RangeError('TUI input escapeDelayMs must be a non-negative finite number.');
  }
  return Object.freeze({ escapeDelayMs });
}

function normalizeLifecyclePolicy(policy: TuiLifecyclePolicy | undefined): NormalizedTuiLifecyclePolicy {
  const fallback = optionalTimeout(policy?.defaultTimeoutMs, 'defaultTimeoutMs');
  return Object.freeze({
    startupTimeoutMs: timeout(policy?.startupTimeoutMs, 'startupTimeoutMs', fallback),
    inputRetirementTimeoutMs: timeout(policy?.inputRetirementTimeoutMs, 'inputRetirementTimeoutMs', fallback),
    runtimeDisposalTimeoutMs: timeout(policy?.runtimeDisposalTimeoutMs, 'runtimeDisposalTimeoutMs', fallback),
    exitHandlerTimeoutMs: timeout(policy?.exitHandlerTimeoutMs, 'exitHandlerTimeoutMs', fallback),
    restorationTimeoutMs: timeout(policy?.restorationTimeoutMs, 'restorationTimeoutMs', fallback),
    outputFlushTimeoutMs: timeout(policy?.outputFlushTimeoutMs, 'outputFlushTimeoutMs', fallback),
    hostDisposalTimeoutMs: timeout(policy?.hostDisposalTimeoutMs, 'hostDisposalTimeoutMs', fallback)
  });
}

function timeout(value: number | undefined, name: keyof TuiLifecyclePolicy, fallback: number | undefined): number {
  const timeoutMs = value ?? fallback ?? defaultTuiLifecyclePolicy[name as keyof NormalizedTuiLifecyclePolicy];
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError(`TUI lifecycle ${name} must be a non-negative finite number.`);
  }
  return timeoutMs;
}

function optionalTimeout(value: number | undefined, name: keyof TuiLifecyclePolicy): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`TUI lifecycle ${name} must be a non-negative finite number.`);
  }
  return value;
}

function normalizeSessionPolicy(policy: SessionProtocolPolicy | undefined): SessionProtocolPolicy {
  const value = policy ?? defaultSessionProtocolPolicy;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('TUI session policy must be an object.');
  }
  if (typeof value.keyboard !== 'object' || value.keyboard === null || Array.isArray(value.keyboard)) {
    throw new TypeError('TUI session policy keyboard must be an object.');
  }
  if (typeof value.cursorVisibility !== 'object'
    || value.cursorVisibility === null
    || Array.isArray(value.cursorVisibility)) {
    throw new TypeError('TUI session policy cursorVisibility must be an object.');
  }
  if (typeof value.mouseReporting !== 'object'
    || value.mouseReporting === null
    || Array.isArray(value.mouseReporting)) {
    throw new TypeError('TUI session policy mouseReporting must be an object.');
  }
  return Object.freeze({
    alternateScreen: protocolRequirement(value.alternateScreen, 'alternateScreen'),
    rawInput: protocolRequirement(value.rawInput, 'rawInput'),
    bracketedPaste: protocolRequirement(value.bracketedPaste, 'bracketedPaste'),
    focusReporting: protocolRequirement(value.focusReporting, 'focusReporting'),
    unicodeGraphemeMode: protocolRequirement(value.unicodeGraphemeMode, 'unicodeGraphemeMode'),
    keyboard: Object.freeze({
      profile: normalizeKeyboardProfile(value.keyboard.profile),
      requirement: protocolRequirement(value.keyboard.requirement, 'keyboard.requirement')
    }),
    cursorVisibility: Object.freeze({
      state: cursorVisibility(value.cursorVisibility.state),
      requirement: protocolRequirement(value.cursorVisibility.requirement, 'cursorVisibility.requirement')
    }),
    mouseReporting: Object.freeze({
      mode: mouseReportingMode(value.mouseReporting.mode),
      requirement: protocolRequirement(value.mouseReporting.requirement, 'mouseReporting.requirement')
    })
  });
}

function normalizeInitialFocus(selector: InitialFocusSelector | undefined): InitialFocusSelector | undefined {
  if (selector === undefined) return undefined;
  if (typeof selector !== 'object' || selector === null || Array.isArray(selector)) {
    throw new TypeError('TUI initial focus selector must be an object.');
  }
  if (selector.kind === 'path') {
    const path = selector.path;
    if (!Array.isArray(selector.path)) throw new TypeError('TUI initial focus path must be an array.');
    if (path.length === 0 || path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new TypeError('TUI initial focus path must contain non-empty string segments.');
    }
    return Object.freeze({ kind: 'path', path: Object.freeze([...path]) });
  }
  const elementId = nonEmptyString(selector.elementId, 'elementId');
  if (selector.kind === 'element') return Object.freeze({ kind: 'element', elementId });
  if (selector.kind !== 'elementTarget') throw new TypeError('TUI initial focus selector kind is invalid.');
  return Object.freeze({
    kind: 'elementTarget',
    elementId,
    targetId: nonEmptyString(selector.targetId, 'targetId')
  });
}

function protocolRequirement(
  value: ProtocolRequirement,
  name: string
): ProtocolRequirement {
  if (value === 'required' || value === 'optional' || value === 'disabled') return value;
  throw new TypeError(`TUI session policy ${name} is invalid.`);
}

function cursorVisibility(value: CursorVisibilityPolicy): CursorVisibilityPolicy {
  if (value === 'hide' || value === 'show' || value === 'unchanged') return value;
  throw new TypeError('TUI session policy cursorVisibility.state is invalid.');
}

function mouseReportingMode(value: MouseReportingMode): MouseReportingMode {
  if (value === 'none' || value === 'click' || value === 'drag' || value === 'all') return value;
  throw new TypeError('TUI session policy mouseReporting.mode is invalid.');
}

function nonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`TUI initial focus ${name} must be non-empty.`);
  }
  return value;
}
