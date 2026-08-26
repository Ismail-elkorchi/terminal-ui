import { diagnostic } from '../diagnostics.ts';
import { LEGACY_KEYBOARD_PROFILE, decodeKeyboardProfile } from '../protocol/index.ts';
import {
  createInputDecoderFromNormalizedOptions,
  decodeInputChunk,
  resolveInputDecodeLimits
} from './decoder.ts';
import type { NormalizedInputDecodeOptions } from './decoder.ts';
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
  const decoder = createInputDecoderFromNormalizedOptions(decodeOptions(profile));
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

export function resolveInputPipelineProfile(options?: InputPipelineOptions): InputPipelineProfile;
export function resolveInputPipelineProfile(options: unknown = {}): InputPipelineProfile {
  const supplied = record(options, 'Input pipeline options');
  const keyboard = supplied['keyboard'];
  const bracketedPaste = supplied['bracketedPaste'];
  const focusReporting = supplied['focusReporting'];
  const mouseReporting = supplied['mouseReporting'];
  const escapeDelayMs = supplied['escapeDelayMs'];
  const limits = supplied['limits'];
  if (bracketedPaste !== undefined && typeof bracketedPaste !== 'boolean') {
    throw new TypeError('Input pipeline option bracketedPaste must be boolean.');
  }
  if (focusReporting !== undefined && typeof focusReporting !== 'boolean') {
    throw new TypeError('Input pipeline option focusReporting must be boolean.');
  }
  if (mouseReporting !== undefined
    && mouseReporting !== 'none'
    && mouseReporting !== 'click'
    && mouseReporting !== 'drag'
    && mouseReporting !== 'all') {
    throw new TypeError('Input pipeline mouseReporting is unsupported.');
  }
  const requested = decodeKeyboardProfile(keyboard ?? LEGACY_KEYBOARD_PROFILE);
  const capabilities = requested.kind === 'legacy'
    ? undefined
    : optionalRecord(supplied['capabilities'], 'Input pipeline capabilities');
  const keyboardCapability = requested.kind === 'legacy'
    ? undefined
    : optionalRecord(
        capabilities?.['keyboardProtocol'],
        'Input pipeline keyboard capability',
      );
  const keyboardSupport = keyboardCapability?.['support'];
  if (keyboardSupport !== undefined
    && keyboardSupport !== 'supported'
    && keyboardSupport !== 'unsupported'
    && keyboardSupport !== 'unknown') {
    throw new TypeError('Input pipeline keyboard capability support is invalid.');
  }
  const keyboardAvailability = keyboardCapability?.['availability'];
  if (keyboardAvailability !== undefined
    && keyboardAvailability !== 'available'
    && keyboardAvailability !== 'unavailable') {
    throw new TypeError('Input pipeline keyboard capability availability is invalid.');
  }
  const available = requested.kind === 'legacy'
    || keyboardSupport === 'supported' && keyboardAvailability === 'available';
  const active = available ? requested : LEGACY_KEYBOARD_PROFILE;
  return Object.freeze({
    keyboard: Object.freeze({ active, requested }),
    bracketedPaste: bracketedPaste ?? false,
    focusReporting: focusReporting ?? false,
    mouseReporting: mouseReporting ?? 'none',
    escapeDelayMs: escapeDelay(escapeDelayMs),
    limits: resolveInputDecodeLimits(limits),
    diagnostics: Object.freeze(available
      ? []
      : [unsupportedKeyboardDiagnostic(requested, keyboardSupport, keyboardAvailability)])
  });
}

function escapeDelay(value: unknown): number {
  const delay = value ?? 25;
  if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
    throw new RangeError('Input escapeDelayMs must be a non-negative finite number.');
  }
  return delay;
}

function record(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function optionalRecord(
  value: unknown,
  subject: string,
): Readonly<Record<string, unknown>> | undefined {
  return value === undefined ? undefined : record(value, subject);
}

function decodeOptions(profile: InputPipelineProfile): NormalizedInputDecodeOptions {
  return Object.freeze({
    bracketedPaste: profile.bracketedPaste,
    focusReporting: profile.focusReporting,
    mouseReporting: profile.mouseReporting,
    keyboard: profile.keyboard.active,
    limits: profile.limits
  });
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

function unsupportedKeyboardDiagnostic(
  requested: TerminalKeyboardProfile,
  support: TerminalCapabilityProfile['keyboardProtocol']['support'] | undefined,
  availability: TerminalCapabilityProfile['keyboardProtocol']['availability'] | undefined
): TerminalDiagnostic {
  return diagnostic('INPUT_PROFILE_UNSUPPORTED', 'Requested keyboard profile is unavailable; using legacy decoding.', {
    severity: 'warning',
    data: {
      requested: requested.kind === 'kitty' ? `kitty:${String(requested.flags)}` : 'legacy',
      active: 'legacy',
      support: support ?? 'unknown',
      availability: availability ?? 'unavailable'
    }
  });
}
