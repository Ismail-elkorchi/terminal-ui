import { diagnostic } from '../diagnostics.ts';
import { LEGACY_KEYBOARD_PROFILE, normalizeKeyboardProfile } from '../protocol/index.ts';
import { createInputDecoder, decodeInputChunk } from './decoder.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalInputChunk } from '../host/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/index.ts';
import type { InputDecodeLimits, InputDecodeOptions, InputDecoderBatch, InputEvent } from './types.ts';

export type KeyboardInputProfileRequest = 'auto' | TerminalKeyboardProfile;

export interface InputPipelineOptions {
  readonly capabilities?: TerminalCapabilityProfile;
  readonly keyboard?: KeyboardInputProfileRequest;
  readonly bracketedPaste?: boolean;
  readonly escapeDelayMs?: number;
  readonly limits?: Partial<InputDecodeLimits>;
}

export interface InputPipelineProfile {
  readonly keyboard: {
    readonly active: TerminalKeyboardProfile;
    readonly requested: KeyboardInputProfileRequest;
  };
  readonly bracketedPaste: boolean;
  readonly escapeDelayMs: number;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export interface InputPipeline {
  readonly profile: InputPipelineProfile;
  decode(chunk: TerminalInputChunk, options?: InputDecodeOptions): InputDecoderBatch;
  decodeOnce(chunk: TerminalInputChunk, options?: InputDecodeOptions): readonly InputEvent[];
  flush(): InputDecoderBatch;
  reset(): void;
}

export function createInputPipeline(options: InputPipelineOptions = {}): InputPipeline {
  const profile = resolveInputPipelineProfile(options);
  const decoder = createInputDecoder(pipelineDecodeOptions(profile, options.limits));
  return {
    profile,
    decode: (chunk, override) => override === undefined
      ? decoder.decode(chunk)
      : { events: decodeInputChunk(chunk, pipelineDecodeOptions(profile, options.limits, override)), pending: { kind: 'none' } },
    decodeOnce: (chunk, override) => decodeInputChunk(chunk, pipelineDecodeOptions(profile, options.limits, override)),
    flush: () => decoder.flush(),
    reset: () => { decoder.reset(); }
  };
}

export function resolveInputPipelineProfile(options: InputPipelineOptions = {}): InputPipelineProfile {
  const requested = options.keyboard ?? 'auto';
  const requestedProfile = requested === 'auto' ? LEGACY_KEYBOARD_PROFILE : normalizeKeyboardProfile(requested);
  const available = requestedProfile.kind === 'legacy' || capabilityUsable(options.capabilities?.keyboardProtocol);
  const active = available ? requestedProfile : LEGACY_KEYBOARD_PROFILE;
  return {
    keyboard: { active, requested },
    bracketedPaste: options.bracketedPaste ?? capabilityUsable(options.capabilities?.bracketedPaste, true),
    escapeDelayMs: escapeDelay(options.escapeDelayMs),
    diagnostics: available ? [] : [unsupportedKeyboardDiagnostic(requestedProfile, options.capabilities)]
  };
}

function escapeDelay(value: number | undefined): number {
  const delay = value ?? 25;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError('Input escapeDelayMs must be a non-negative finite number.');
  }
  return delay;
}

function decodeOptions(profile: InputPipelineProfile): InputDecodeOptions {
  return { bracketedPaste: profile.bracketedPaste, keyboard: profile.keyboard.active };
}

function pipelineDecodeOptions(
  profile: InputPipelineProfile,
  configuredLimits: Partial<InputDecodeLimits> | undefined,
  override: InputDecodeOptions = {}
): InputDecodeOptions {
  const limits = configuredLimits === undefined && override.limits === undefined
    ? undefined
    : { ...configuredLimits, ...override.limits };
  return {
    ...decodeOptions(profile),
    ...override,
    ...(limits === undefined ? {} : { limits })
  };
}

function capabilityUsable(
  capability: TerminalCapabilityProfile['keyboardProtocol'] | undefined,
  missingDefault = false
): boolean {
  if (capability === undefined) return missingDefault;
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
