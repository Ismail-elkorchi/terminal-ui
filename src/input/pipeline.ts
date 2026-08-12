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
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('Input pipeline options must be an object.');
  }
  const {
    capabilities,
    keyboard,
    bracketedPaste,
    focusReporting,
    mouseReporting,
    escapeDelayMs,
    limits
  } = options;
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
  if (capabilities !== undefined
    && (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities))) {
    throw new TypeError('Input pipeline capabilities must be an object.');
  }
  if (limits !== undefined && (typeof limits !== 'object' || limits === null || Array.isArray(limits))) {
    throw new TypeError('Input pipeline limits must be an object.');
  }
  const requested = normalizeKeyboardProfile(keyboard ?? LEGACY_KEYBOARD_PROFILE);
  const requestedProfile = requested;
  const keyboardCapability = capabilities?.keyboardProtocol;
  const keyboardSupport = keyboardCapability?.support;
  const keyboardAvailability = keyboardCapability?.availability;
  const available = requestedProfile.kind === 'legacy'
    || keyboardSupport === 'supported' && keyboardAvailability === 'available';
  const active = available ? requestedProfile : LEGACY_KEYBOARD_PROFILE;
  return Object.freeze({
    keyboard: Object.freeze({ active, requested }),
    bracketedPaste: bracketedPaste ?? false,
    focusReporting: focusReporting ?? false,
    mouseReporting: mouseReporting ?? 'none',
    escapeDelayMs: escapeDelay(escapeDelayMs),
    limits: normalizeInputDecodeLimits(limits),
    diagnostics: Object.freeze(available
      ? []
      : [unsupportedKeyboardDiagnostic(requestedProfile, keyboardSupport, keyboardAvailability)])
  });
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
