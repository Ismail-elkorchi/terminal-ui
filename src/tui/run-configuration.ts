import { defaultSessionProtocolPolicy } from './session-policy.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { MouseReportingMode } from '../host/index.ts';
import type { SessionProtocolPolicy } from './session-policy.ts';
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

function normalizeSessionPolicy(policy: unknown): SessionProtocolPolicy {
  const value = policy ?? defaultSessionProtocolPolicy;
  if (!isNonArrayObject(value)) throw new TypeError('TUI session policy must be an object.');
  const keyboard = requiredRecord(value['keyboard'], 'keyboard');
  const cursorVisibility = requiredRecord(value['cursorVisibility'], 'cursorVisibility');
  const mouseReporting = requiredRecord(value['mouseReporting'], 'mouseReporting');
  return Object.freeze({
    alternateScreen: protocolRequirement(value['alternateScreen'], 'alternateScreen'),
    rawInput: protocolRequirement(value['rawInput'], 'rawInput'),
    bracketedPaste: protocolRequirement(value['bracketedPaste'], 'bracketedPaste'),
    focusReporting: protocolRequirement(value['focusReporting'], 'focusReporting'),
    keyboard: Object.freeze({
      profile: normalizeKeyboardProfile(keyboard['profile']),
      requirement: protocolRequirement(keyboard['requirement'], 'keyboard.requirement')
    }),
    cursorVisibility: Object.freeze({
      state: oneOf(cursorVisibility['state'], ['hide', 'show', 'unchanged'] as const, 'cursorVisibility.state'),
      requirement: protocolRequirement(cursorVisibility['requirement'], 'cursorVisibility.requirement')
    }),
    mouseReporting: Object.freeze({
      mode: oneOf(
        mouseReporting['mode'],
        ['none', 'click', 'drag', 'all'] as const satisfies readonly MouseReportingMode[],
        'mouseReporting.mode'
      ),
      requirement: protocolRequirement(mouseReporting['requirement'], 'mouseReporting.requirement')
    })
  });
}

function normalizeInitialFocus(selector: unknown): InitialFocusSelector | undefined {
  if (selector === undefined) return undefined;
  if (!isNonArrayObject(selector)) throw new TypeError('TUI initial focus selector must be an object.');
  if (selector['kind'] === 'path') {
    if (!Array.isArray(selector['path'])) throw new TypeError('TUI initial focus path must be an array.');
    const path: readonly unknown[] = selector['path'];
    if (path.length === 0 || path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new TypeError('TUI initial focus path must contain non-empty string segments.');
    }
    return Object.freeze({ kind: 'path', path: Object.freeze(path.map((segment) => String(segment))) });
  }
  const elementId = nonEmptyString(selector['elementId'], 'elementId');
  if (selector['kind'] === 'element') return Object.freeze({ kind: 'element', elementId });
  if (selector['kind'] !== 'elementTarget') throw new TypeError('TUI initial focus selector kind is invalid.');
  return Object.freeze({
    kind: 'elementTarget',
    elementId,
    targetId: nonEmptyString(selector['targetId'], 'targetId')
  });
}

function protocolRequirement(
  value: unknown,
  name: string
): SessionProtocolPolicy['alternateScreen'] {
  return oneOf(value, ['required', 'optional', 'disabled'] as const, name);
}

function oneOf<const TValues extends readonly string[]>(
  value: unknown,
  values: TValues,
  name: string
): TValues[number] {
  if (typeof value === 'string') {
    for (const candidate of values) {
      if (candidate === value) return candidate;
    }
  }
  throw new TypeError(`TUI session policy ${name} is invalid.`);
}

function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isNonArrayObject(value)) throw new TypeError(`TUI session policy ${name} must be an object.`);
  return value;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`TUI initial focus ${name} must be non-empty.`);
  }
  return value;
}
