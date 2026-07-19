import { defaultSessionProtocolPolicy } from './session-policy.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { MouseReportingMode } from '../host/index.ts';
import type { SessionProtocolPolicy } from './session-policy.ts';
import type { TuiCleanupPolicy, TuiRunInputPolicy, TuiRunOptions, TuiTheme } from './types.ts';
import { normalizeKeyboardProfile } from '../protocol/index.ts';

export interface NormalizedTuiRunOptions<TState> {
  readonly initialFocus?: InitialFocusSelector;
  readonly theme?: TuiTheme<TState>;
  readonly sessionPolicy: SessionProtocolPolicy;
  readonly cleanup: TuiCleanupPolicy;
  readonly input: Readonly<Required<TuiRunInputPolicy>>;
}

export const defaultTuiFinalizationPolicy: TuiCleanupPolicy = Object.freeze({ timeoutMs: 1_000 });

export function normalizeTuiRunOptions<TState>(
  options: TuiRunOptions<TState>
): NormalizedTuiRunOptions<TState> {
  const initialFocus = normalizeInitialFocus(options.initialFocus);
  return Object.freeze({
    ...(initialFocus === undefined ? {} : { initialFocus }),
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    sessionPolicy: normalizeSessionPolicy(options.sessionPolicy),
    cleanup: normalizeCleanupPolicy(options.cleanup),
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

function normalizeCleanupPolicy(policy: TuiCleanupPolicy | undefined): TuiCleanupPolicy {
  const timeoutMs = policy?.timeoutMs ?? defaultTuiFinalizationPolicy.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('TUI cleanup timeoutMs must be a non-negative finite number.');
  }
  return Object.freeze({ timeoutMs });
}

function normalizeSessionPolicy(policy: unknown): SessionProtocolPolicy {
  const value = policy ?? defaultSessionProtocolPolicy;
  if (!isRecord(value)) throw new TypeError('TUI session policy must be an object.');
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
  if (!isRecord(selector)) throw new TypeError('TUI initial focus selector must be an object.');
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
  if (!isRecord(value)) throw new TypeError(`TUI session policy ${name} must be an object.`);
  return value;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`TUI initial focus ${name} must be non-empty.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
