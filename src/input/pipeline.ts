import { diagnostic } from '../diagnostics.ts';
import { createInputDecoder, decodeInputChunk } from './decoder.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile } from '../host/index.ts';
import type { TerminalInputChunk } from '../host/index.ts';
import type { InputDecodeOptions, InputEvent } from './types.ts';

export type KeyboardInputProfileName = 'legacy';
export type KeyboardInputProfileRequest = 'auto' | 'legacy' | 'enhanced';

export interface InputPipelineOptions {
  readonly capabilities?: TerminalCapabilityProfile;
  readonly keyboard?: KeyboardInputProfileRequest;
  readonly bracketedPaste?: boolean;
}

export interface InputPipelineProfile {
  readonly keyboard: {
    readonly active: KeyboardInputProfileName;
    readonly requested: KeyboardInputProfileRequest;
  };
  readonly bracketedPaste: boolean;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export interface InputPipeline {
  readonly profile: InputPipelineProfile;
  decode(chunk: TerminalInputChunk, options?: InputDecodeOptions): readonly InputEvent[];
  decodeOnce(chunk: TerminalInputChunk, options?: InputDecodeOptions): readonly InputEvent[];
  flush(): readonly InputEvent[];
  reset(): void;
}

export function createInputPipeline(options: InputPipelineOptions = {}): InputPipeline {
  const profile = resolveInputPipelineProfile(options);
  const decoder = createInputDecoder(decodeOptions(profile));
  return {
    profile,
    decode(chunk, override) {
      return override === undefined
        ? decoder.decode(chunk)
        : decodeInputChunk(chunk, { ...decodeOptions(profile), ...override });
    },
    decodeOnce(chunk, override) {
      return decodeInputChunk(chunk, { ...decodeOptions(profile), ...override });
    },
    flush() {
      return decoder.flush();
    },
    reset() {
      decoder.reset();
    }
  };
}

export function resolveInputPipelineProfile(options: InputPipelineOptions = {}): InputPipelineProfile {
  const requested = options.keyboard ?? 'auto';
  const diagnostics = requested === 'enhanced' || enhancedKeyboardDetected(options.capabilities)
    ? [unsupportedEnhancedKeyboardDiagnostic(requested, options.capabilities)]
    : [];
  return {
    keyboard: {
      active: 'legacy',
      requested
    },
    bracketedPaste: options.bracketedPaste ?? bracketedPasteSupported(options.capabilities),
    diagnostics
  };
}

function decodeOptions(profile: InputPipelineProfile): InputDecodeOptions {
  return { bracketedPaste: profile.bracketedPaste };
}

function bracketedPasteSupported(capabilities: TerminalCapabilityProfile | undefined): boolean {
  return capabilities === undefined || capabilities.bracketedPaste.status === 'supported';
}

function enhancedKeyboardDetected(capabilities: TerminalCapabilityProfile | undefined): boolean {
  return capabilities?.enhancedKeyboard.status === 'supported';
}

function unsupportedEnhancedKeyboardDiagnostic(
  requested: KeyboardInputProfileRequest,
  capabilities: TerminalCapabilityProfile | undefined
): TerminalDiagnostic {
  return diagnostic('INPUT_PROFILE_UNSUPPORTED', 'Enhanced keyboard input profile is unavailable; using legacy keyboard decoding.', {
    severity: requested === 'enhanced' ? 'warning' : 'info',
    data: {
      requested,
      active: 'legacy',
      capability: capabilities?.enhancedKeyboard.status ?? 'unknown',
      confidence: capabilities?.enhancedKeyboard.confidence ?? 'unknown'
    }
  });
}
