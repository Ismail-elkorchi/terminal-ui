import { waitForTerminalOperation } from './operation.ts';
import { resolveTerminalCapabilities } from './capabilities.ts';
import type { TerminalInputAuthority } from './input-authority.ts';
import type {
  ProtocolProbeFacts,
  TerminalCapabilityResolverInput
} from './capabilities.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';
import type {
  TerminalCapabilityDetectionOptions,
  TerminalClock,
  TerminalOutputChunk,
  TerminalSession,
  TerminalWriteReceipt
} from './types.ts';
import { requireCommittedTerminalWrite } from './write-receipt.ts';
import { LEGACY_KEYBOARD_PROFILE, kittyKeyboardProfile } from '../protocol/keyboard.ts';
import {
  createTerminalModeResponseProtocol,
  modeIsMutable,
  terminalModeQueryRequest
} from './terminal-mode-query.ts';
import type { TerminalModeReports, TerminalModeReportState } from './terminal-mode-query.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';

const KITTY_KEYBOARD_QUERY = '\u001B[?u\u001B[c';
const DEFAULT_PROBE_TIMEOUT_MS = 100;
const PROBE_TIMER_CLOSED = 'terminal_capability_probe_completed';

export interface TerminalCapabilityDetectorOptions {
  readonly input: TerminalInputAuthority;
  readonly clock: TerminalClock;
  readonly resolverInput: TerminalCapabilityResolverInput;
  readonly beginSession: (id: string, capabilities: TerminalCapabilityProfile) => Promise<TerminalSession>;
  readonly observeModes: (reports: TerminalModeReports) => Promise<void>;
  readonly observeKeyboardProfile: (profile: TerminalKeyboardProfile) => Promise<void>;
  readonly write: (output: TerminalOutputChunk, signal: AbortSignal) => Promise<TerminalWriteReceipt>;
}

type KeyboardProfileVerification = 'verified' | 'unsupported' | 'inconclusive';

export class TerminalCapabilityDetector {
  readonly #options: TerminalCapabilityDetectorOptions;
  readonly #configuredProbeFacts: ProtocolProbeFacts;
  #probeFacts: ProtocolProbeFacts;
  #profile: TerminalCapabilityProfile;
  #keyboardProbe: Promise<void> | undefined;
  #modeProbe: Promise<void> | undefined;
  #probeTail: Promise<void> | undefined;
  #modesObserved = false;

  constructor(options: TerminalCapabilityDetectorOptions) {
    this.#options = options;
    this.#configuredProbeFacts = { ...options.resolverInput.probes };
    this.#probeFacts = { ...this.#configuredProbeFacts };
    this.#profile = this.#resolve();
  }

  current(): TerminalCapabilityProfile {
    return this.#profile;
  }

  async verifyKeyboardProfile(
    expectedFlags: number,
    signal?: AbortSignal,
    timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
  ): Promise<KeyboardProfileVerification> {
    await this.#options.input.settleResponseQuarantine(signal);
    signal?.throwIfAborted();
    const timeout = probeController(timeoutMs, this.#options.clock);
    const operationSignal = signal === undefined
      ? timeout.signal
      : AbortSignal.any([signal, timeout.signal]);
    try {
      const result = await this.#options.input.probeKittyKeyboard(
        operationSignal,
        this.#options.clock,
        async () => {
          requireCommittedTerminalWrite(await this.#options.write(
            { text: KITTY_KEYBOARD_QUERY },
            operationSignal
          ));
        }
      );
      if (result.status === 'unsupported') return 'unsupported';
      return result.status === 'supported' && result.flags === expectedFlags
        ? 'verified'
        : 'inconclusive';
    } finally {
      timeout.close();
    }
  }

  async detect(options: TerminalCapabilityDetectionOptions = {}): Promise<TerminalCapabilityProfile> {
    options.signal?.throwIfAborted();
    if (options.refresh === true) {
      await this.#settleActiveProbes(options.signal);
      this.#resetObservedProbes();
    }
    if (
      options.activeProbes?.includes('terminalModes') === true
      && this.#profile.isTty
      && !this.#modesObserved
    ) {
      if (this.#modeProbe === undefined) {
        this.#modeProbe = this.#runProbeExclusive(
          () => this.#probeModes(
            options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
            options.signal
          )
        ).finally(() => {
          this.#modeProbe = undefined;
        });
      }
      await waitForTerminalOperation(
        this.#modeProbe,
        options.signal === undefined ? {} : { signal: options.signal }
      );
    }
    if (
      options.activeProbes?.includes('keyboardProtocol') === true
      && this.#profile.keyboardProtocol.support === 'unknown'
      && this.#profile.keyboardProtocol.availability === 'available'
    ) {
      options.signal?.throwIfAborted();
      if (this.#keyboardProbe === undefined) {
        this.#keyboardProbe = this.#runProbeExclusive(
          () => this.#probeKeyboard(
            options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
            options.signal
          )
        ).finally(() => {
          this.#keyboardProbe = undefined;
        });
      }
      await waitForTerminalOperation(
        this.#keyboardProbe,
        options.signal === undefined ? {} : { signal: options.signal }
      );
    }
    return this.#profile;
  }

  #resetObservedProbes(): void {
    this.#modesObserved = false;
    this.#probeFacts = { ...this.#configuredProbeFacts };
    this.#profile = this.#resolve();
  }

  async #probeModes(timeoutMs: number, ownerSignal?: AbortSignal): Promise<void> {
    await this.#options.input.settleResponseQuarantine(ownerSignal);
    ownerSignal?.throwIfAborted();
    const operationController = probeController(timeoutMs, this.#options.clock, ownerSignal);
    let reports: TerminalModeReports | undefined;
    let failure: unknown;
    const session = await this.#options.beginSession('terminal-mode-probe', this.#profile);
    try {
      const raw = await session.enableRawInput({ signal: operationController.signal });
      if (raw.status === 'applied') {
        const result = await this.#options.input.queryTerminal({
          signal: operationController.signal,
          clock: this.#options.clock,
          protocol: createTerminalModeResponseProtocol(),
          send: async () => {
            requireCommittedTerminalWrite(await this.#options.write(
              { text: terminalModeQueryRequest() },
              operationController.signal
            ));
          }
        });
        if (result.status === 'matched') reports = result.value;
      }
    } catch (cause) {
      failure = cause;
    } finally {
      operationController.close();
      try {
        const restored = await session.restore('success');
        if (restored.status !== 'restored') {
          failure = new Error('Terminal mode probing could not restore its temporary input session.');
        }
      } catch (cause) {
        failure = cause;
      }
    }
    if (failure !== undefined) throw terminalProbeError(failure);
    if (reports === undefined) return;
    await this.#options.observeModes(reports);
    this.#recordModeProbe(reports);
    this.#modesObserved = true;
  }

  async #probeKeyboard(timeoutMs: number, ownerSignal?: AbortSignal): Promise<void> {
    await this.#options.input.settleResponseQuarantine(ownerSignal);
    ownerSignal?.throwIfAborted();
    const operationController = probeController(timeoutMs, this.#options.clock, ownerSignal);
    let failure: unknown;
    let observedProfile: TerminalKeyboardProfile | undefined;
    const session = await this.#options.beginSession('terminal-capability-probe', this.#profile);
    try {
      const raw = await session.enableRawInput({ signal: operationController.signal });
      if (raw.status !== 'applied') {
        this.#recordKeyboardProbe('unknown');
      } else {
        const result = await this.#options.input.probeKittyKeyboard(
          operationController.signal,
          this.#options.clock,
          async () => {
            requireCommittedTerminalWrite(await this.#options.write(
              { text: KITTY_KEYBOARD_QUERY },
              operationController.signal
            ));
          }
        );
        this.#recordKeyboardProbe(result.status === 'inconclusive' ? 'unknown' : result.status);
        if (result.status === 'unsupported') observedProfile = LEGACY_KEYBOARD_PROFILE;
        else if (result.status === 'supported' && result.flags !== undefined) {
          try {
            observedProfile = result.flags === 0
              ? LEGACY_KEYBOARD_PROFILE
              : kittyKeyboardProfile(result.flags);
          } catch {
            observedProfile = undefined;
          }
        }
      }
    } catch (cause) {
      failure = cause;
    } finally {
      operationController.close();
      try {
        const restored = await session.restore('success');
        if (restored.status !== 'restored') {
          failure = new Error('Kitty keyboard probing could not restore its temporary input session.');
        }
      } catch (cause) {
        failure = cause;
      }
    }
    if (failure !== undefined) throw terminalProbeError(failure);
    if (observedProfile !== undefined) {
      await this.#options.observeKeyboardProfile(observedProfile);
    }
  }

  #recordModeProbe(reports: TerminalModeReports): void {
    this.#probeFacts.cursorVisibility = modeSupport(reports[25]);
    this.#probeFacts.focusReporting = modeSupport(reports[1004]);
    this.#probeFacts.alternateScreen = modeSupport(reports[1049]);
    this.#probeFacts.bracketedPaste = modeSupport(reports[2004]);
    this.#probeFacts.mouseReporting = mouseModeSupport(reports);
    this.#probeFacts.unicodeGraphemeMode = modeSupport(reports[2027]);
    this.#probeFacts.synchronizedOutput = reports[2026] === 'set'
      ? 'unknown'
      : modeSupport(reports[2026]);
    this.#profile = this.#resolve();
  }

  #recordKeyboardProbe(support: 'supported' | 'unsupported' | 'unknown'): void {
    this.#probeFacts.keyboardProtocol = support;
    this.#profile = this.#resolve();
  }

  #resolve(): TerminalCapabilityProfile {
    return resolveTerminalCapabilities({
      ...this.#options.resolverInput,
      probes: this.#probeFacts
    });
  }

  #runProbeExclusive(operation: () => Promise<void>): Promise<void> {
    const run = (): Promise<void> => operation();
    const result = this.#probeTail === undefined
      ? run()
      : this.#probeTail.then(run, run);
    const settled = result.then(() => undefined, () => undefined);
    this.#probeTail = settled;
    void settled.then(() => {
      if (this.#probeTail === settled) this.#probeTail = undefined;
    });
    return result;
  }

  async #settleActiveProbes(signal?: AbortSignal): Promise<void> {
    const probes = [this.#modeProbe, this.#keyboardProbe]
      .filter((probe): probe is Promise<void> => probe !== undefined);
    if (probes.length === 0) return;
    await waitForTerminalOperation(
      Promise.allSettled(probes).then(() => undefined),
      signal === undefined ? {} : { signal }
    );
  }
}

interface ProbeController {
  readonly signal: AbortSignal;
  close(): void;
}

function probeController(
  timeoutMs: number,
  clock: TerminalClock,
  ownerSignal?: AbortSignal
): ProbeController {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Capability probe timeout must be a positive finite number.');
  }
  const operation = new AbortController();
  const timer = new AbortController();
  void clock.sleep(timeoutMs, timer.signal).then(
    () => {
      if (!timer.signal.aborted) operation.abort('terminal_capability_probe_timeout');
    },
    (cause: unknown) => {
      if (!timer.signal.aborted) operation.abort(cause);
    }
  ).catch(() => undefined);
  return {
    signal: ownerSignal === undefined
      ? operation.signal
      : AbortSignal.any([ownerSignal, operation.signal]),
    close: () => {
      timer.abort(PROBE_TIMER_CLOSED);
    }
  };
}

function modeSupport(report: TerminalModeReportState | undefined): 'supported' | 'unsupported' | 'unknown' {
  const mutable = modeIsMutable(report);
  return mutable === undefined ? 'unknown' : mutable ? 'supported' : 'unsupported';
}

function terminalProbeError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error('Terminal capability probing failed.', { cause });
}

function mouseModeSupport(reports: TerminalModeReports): 'supported' | 'unsupported' | 'unknown' {
  const encoding = modeSupport(reports[1006]);
  const tracking = [reports[1000], reports[1002], reports[1003]].map(modeSupport);
  if (encoding === 'unsupported' || tracking.every((support) => support === 'unsupported')) return 'unsupported';
  return encoding === 'supported' && tracking.some((support) => support === 'supported')
    ? 'supported'
    : 'unknown';
}
