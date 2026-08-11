/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
import { diagnostic } from '../diagnostics.ts';
import { LEGACY_KEYBOARD_PROFILE, normalizeKeyboardProfile } from '../protocol/index.ts';
import {
  createInputDecoder,
  decodeInputChunk,
  normalizeInputDecodeLimits
} from './decoder.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { MouseReportingMode, TerminalCapabilityProfile, TerminalInputChunk } from '../host/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/index.ts';
import type {
  InputDecodeLimits,
  InputDecodeOptions,
  InputDecoderBatch,
  InputEvent,
  InputPendingState
} from './types.ts';

export type KeyboardInputProfileRequest = TerminalKeyboardProfile;

export interface InputPipelineOptions {
  readonly capabilities?: TerminalCapabilityProfile;
  readonly keyboard?: KeyboardInputProfileRequest;
  readonly bracketedPaste?: boolean;
  readonly focusReporting?: boolean;
  readonly mouseReporting?: MouseReportingMode;
  readonly escapeDelayMs?: number;
  readonly limits?: Partial<InputDecodeLimits>;
}

export interface InputPipelineProfile {
  readonly keyboard: {
    readonly active: TerminalKeyboardProfile;
    readonly requested: KeyboardInputProfileRequest;
  };
  readonly bracketedPaste: boolean;
  readonly focusReporting: boolean;
  readonly mouseReporting: MouseReportingMode;
  readonly escapeDelayMs: number;
  readonly limits: InputDecodeLimits;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export interface InputPipeline {
  readonly profile: InputPipelineProfile;
  decode(chunk: TerminalInputChunk): InputDecoderBatch;
  decodeOnce(chunk: TerminalInputChunk, options?: InputDecodeOptions): readonly InputEvent[];
  flush(): InputDecoderBatch;
  pending(): InputPendingState;
  reset(): void;
}

export function createInputPipeline(options: InputPipelineOptions = {}): InputPipeline {
  const profile = resolveInputPipelineProfile(options);
  const decoder = createInputDecoder(decodeOptions(profile));
  let pending: InputPendingState = noPendingInput;
  return {
    profile,
    decode(chunk) {
      try {
        const batch = decoder.decode(chunk);
        pending = immutablePendingState(batch.pending);
        return { events: batch.events, pending };
      } catch (cause) {
        pending = noPendingInput;
        throw cause;
      }
    },
    decodeOnce: (chunk, override) => decodeInputChunk(chunk, pipelineDecodeOptions(profile, override)),
    flush() {
      try {
        const batch = decoder.flush();
        pending = immutablePendingState(batch.pending);
        return { events: batch.events, pending };
      } catch (cause) {
        pending = noPendingInput;
        throw cause;
      }
    },
    pending: () => pending,
    reset() {
      decoder.reset();
      pending = noPendingInput;
    }
  };
}

export function resolveInputPipelineProfile(options: InputPipelineOptions = {}): InputPipelineProfile {
  validatePipelineOptions(options);
  const requested = normalizeKeyboardProfile(options.keyboard ?? LEGACY_KEYBOARD_PROFILE);
  const requestedProfile = requested;
  const available = requestedProfile.kind === 'legacy' || capabilityUsable(options.capabilities?.keyboardProtocol);
  const active = available ? requestedProfile : LEGACY_KEYBOARD_PROFILE;
  return Object.freeze({
    keyboard: Object.freeze({ active, requested }),
    bracketedPaste: options.bracketedPaste ?? false,
    focusReporting: options.focusReporting ?? false,
    mouseReporting: options.mouseReporting ?? 'none',
    escapeDelayMs: escapeDelay(options.escapeDelayMs),
    limits: normalizeInputDecodeLimits(options.limits),
    diagnostics: Object.freeze(available
      ? []
      : [unsupportedKeyboardDiagnostic(requestedProfile, options.capabilities)])
  });
}

function validatePipelineOptions(value: InputPipelineOptions): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Input pipeline options must be an object.');
  }
  for (const field of ['bracketedPaste', 'focusReporting'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`Input pipeline option ${field} must be boolean.`);
    }
  }
  const mouse = value.mouseReporting;
  if (mouse !== undefined && mouse !== 'none' && mouse !== 'click' && mouse !== 'drag' && mouse !== 'all') {
    throw new TypeError('Input pipeline mouseReporting is unsupported.');
  }
  for (const field of ['capabilities', 'limits'] as const) {
    const nested = value[field];
    if (nested !== undefined && (typeof nested !== 'object' || nested === null || Array.isArray(nested))) {
      throw new TypeError(`Input pipeline ${field} must be an object.`);
    }
  }
}

function escapeDelay(value: number | undefined): number {
  const delay = value ?? 25;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError('Input escapeDelayMs must be a non-negative finite number.');
  }
  return delay;
}

function decodeOptions(profile: InputPipelineProfile): InputDecodeOptions {
  return {
    bracketedPaste: profile.bracketedPaste,
    focusReporting: profile.focusReporting,
    mouseReporting: profile.mouseReporting,
    keyboard: profile.keyboard.active,
    limits: profile.limits
  };
}

function pipelineDecodeOptions(
  profile: InputPipelineProfile,
  override: InputDecodeOptions = {}
): InputDecodeOptions {
  return {
    ...decodeOptions(profile),
    ...override,
    limits: { ...profile.limits, ...override.limits }
  };
}

const noPendingInput: InputPendingState = Object.freeze({ kind: 'none' });

function immutablePendingState(value: InputPendingState): InputPendingState {
  return value.kind === 'none' ? noPendingInput : Object.freeze({ kind: value.kind });
}

function capabilityUsable(capability: TerminalCapabilityProfile['keyboardProtocol'] | undefined): boolean {
  if (capability === undefined) return false;
  return capability.support === 'supported' && capability.availability === 'available';
}

function unsupportedKeyboardDiagnostic(
  requested: TerminalKeyboardProfile,
  capabilities: TerminalCapabilityProfile | undefined
): TerminalDiagnostic {
  return diagnostic('INPUT_PROFILE_UNSUPPORTED', 'Requested keyboard profile is unavailable; using legacy decoding.', {
    severity: 'warning',
    data: {
      requested: requested.kind === 'kitty' ? `kitty:${String(requested.flags)}` : 'legacy',
      active: 'legacy',
      support: capabilities?.keyboardProtocol.support ?? 'unknown',
      availability: capabilities?.keyboardProtocol.availability ?? 'unavailable'
    }
  });
}
