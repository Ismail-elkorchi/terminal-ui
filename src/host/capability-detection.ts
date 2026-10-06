import { resolveCellPresentation, snapshotCellPresentationConfiguration } from './cell-presentation.ts';
import type { CellPresentationObservation, CellPresentationResolution } from './cell-presentation.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';
import { kittyKeyboardProfile, LEGACY_KEYBOARD_PROFILE } from '../protocol/keyboard.ts';
import type {
  GraphicsProbeFacts,
  KittyGraphicsProbeFacts,
  ProtocolProbeFacts,
  TerminalCapabilityResolverInput,
} from './capabilities.ts';
import { resolveTerminalCapabilities } from './capabilities.ts';
import { diagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityName, TerminalCapabilityProfile } from './capability-types.ts';
import {
  cellPixelGeometryQueryRequest,
  createCellPixelGeometryResponseProtocol,
  createKittyGraphicsResponseProtocol,
  createKittyPassthroughResponseProtocol,
  createPrimaryDeviceAttributesResponseProtocol,
  kittyGraphicsQueryRequest,
  kittyPassthroughQueryRequest,
  primaryDeviceAttributesQueryRequest,
} from './graphics-query.ts';
import type { TerminalInputAuthority } from './input-authority.ts';
import { waitForTerminalOperation } from './operation.ts';
import type { TerminalModeEvidence, TerminalModeKey, TerminalModeReports, TerminalModeReportState } from './terminal-mode-query.ts';
import {
  createTerminalModeResponseProtocol,
  modeIsMutable,
  modeIsSet,
  terminalModeQueryRequest,
} from './terminal-mode-query.ts';
import type {
  TerminalCapabilityDetectionOptions,
  TerminalClock,
  TerminalOutputChunk,
  TerminalSession,
  TerminalWriteReceipt,
} from './types.ts';
import { requireCommittedTerminalWrite } from './write-receipt.ts';

const KITTY_KEYBOARD_QUERY = '\u001B[?u\u001B[c';
const DEFAULT_PROBE_TIMEOUT_MS = 100;
const DEFAULT_GRAPHICS_PROBE_TIMEOUT_MS = 500;
const PROBE_TIMER_CLOSED = 'terminal_capability_probe_completed';

export interface TerminalCapabilityDetectorOptions {
  readonly presentationObservation: () => CellPresentationObservation | undefined;
  readonly input: TerminalInputAuthority;
  readonly clock: TerminalClock;
  readonly resolverInput: TerminalCapabilityResolverInput;
  readonly beginSession: (id: string, capabilities: TerminalCapabilityProfile) => Promise<TerminalSession>;
  readonly beginObservationRefresh: () => Promise<void>;
  readonly observeModes: (reports: TerminalModeReports, conflictingModes: readonly TerminalModeKey[]) => Promise<void>;
  readonly observeKeyboardProfile: (profile: TerminalKeyboardProfile) => Promise<void>;
  readonly writeRecovery: (output: TerminalOutputChunk, signal: AbortSignal) => Promise<TerminalWriteReceipt>;
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
  #graphicsProbe: Promise<void> | undefined;
  #probeTail: Promise<void> | undefined;
  #modesObserved = false;
  #modeProbeFailed = false;
  #modeEvidence: TerminalModeEvidence | undefined;
  readonly #modeConflicts = new Set<TerminalModeKey>();
  #cellPresentationMode: TerminalModeReportState | undefined;
  #graphicsObserved = false;
  #graphicsFacts: GraphicsProbeFacts | undefined;

  constructor(options: TerminalCapabilityDetectorOptions) {
    const cellPresentation = snapshotCellPresentationConfiguration(options.resolverInput.cellPresentation);
    this.#options = { ...options, resolverInput: { ...options.resolverInput,
      host: Object.freeze({ ...options.resolverInput.host }),
      environment: { variables: Object.freeze({ ...options.resolverInput.environment?.variables }) },
      ...(cellPresentation === undefined ? {} : { cellPresentation }),
    } };
    this.#configuredProbeFacts = { ...options.resolverInput.probes };
    this.#probeFacts = { ...this.#configuredProbeFacts };
    this.#graphicsFacts = options.resolverInput.graphics;
    this.#profile = this.#resolve();
  }

  current(): TerminalCapabilityProfile {
    this.#profile = this.#resolve();
    return this.#profile;
  }

  resolveCellPresentation(observation: CellPresentationObservation = this.#options.presentationObservation() ?? {}): CellPresentationResolution {
    return resolveCellPresentation(this.#options.resolverInput, {
      ...(this.#modeEvidence?.reports['standard:8'] === undefined ? {} : { report: this.#modeEvidence.reports['standard:8'] }),
      ...(modeIsSet(this.#cellPresentationMode) === true ? { implicit: true } : {}),
      ...observation,
      ...(modeIsSet(this.#cellPresentationMode) === true && modeIsSet(observation.report) !== false
        ? { implicit: true } : {}),
      ...(this.#modeProbeFailed ? { indeterminate: true } : {}),
      conflicting: this.#modeConflicts.has('standard:8') || observation.conflicting === true,
    });
  }

  async observeBidiMode(signal?: AbortSignal, recovery = false): Promise<TerminalModeReportState | undefined> {
    await this.#options.input.settleResponseQuarantine(signal);
    signal?.throwIfAborted();
    const timeout = probeController(DEFAULT_PROBE_TIMEOUT_MS, this.#options.clock, signal);
    const protocol = createTerminalModeResponseProtocol(['standard:8']);
    try {
      const result = await this.#options.input.queryTerminal({
        signal: timeout.signal,
        clock: this.#options.clock,
        protocol,
        send: async () => {
          const write = recovery ? this.#options.writeRecovery : this.#options.write;
          requireCommittedTerminalWrite(await write(
            { text: terminalModeQueryRequest(['standard:8']) }, timeout.signal
          ));
        }
      });
      const report = result.status !== 'failed' && signal?.aborted !== true ? protocol.evidence().reports['standard:8'] : undefined;
      if (protocol.evidence().conflictingModes.includes('standard:8')) this.#modeConflicts.add('standard:8');
      else if (modeIsSet(report) !== undefined) {
        this.#cellPresentationMode = report;
        this.#modeConflicts.delete('standard:8');
      }
      this.#profile = this.#resolve();
      return report;
    } finally {
      timeout.close();
      // Retire this readback's replies before a later observation generation.
      await this.#options.input.settleResponseQuarantine();
    }
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
      await this.#options.input.settleResponseQuarantine();
    }
  }

  async detect(options: TerminalCapabilityDetectionOptions = {}): Promise<TerminalCapabilityProfile> {
    options.signal?.throwIfAborted();
    if (options.refresh === true) {
      await this.#settleActiveProbes(options.signal);
      await this.#options.beginObservationRefresh();
      this.#resetObservedProbes();
    }
    if (
      options.activeProbes?.includes('graphics') === true
      && this.#profile.isTty
      && !this.#graphicsObserved
    ) {
      if (this.#graphicsProbe === undefined) {
        this.#graphicsProbe = this.#runProbeExclusive(
          () => this.#probeGraphics(options.probeTimeoutMs ?? DEFAULT_GRAPHICS_PROBE_TIMEOUT_MS, options.signal)
        ).finally(() => { this.#graphicsProbe = undefined; });
      }
      await waitForTerminalOperation(
        this.#graphicsProbe,
        options.signal === undefined ? {} : { signal: options.signal }
      );
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
    this.#profile = this.#resolve();
    return this.#profile;
  }

  #resetObservedProbes(): void {
    this.#modesObserved = false;
    if (this.#cellPresentationMode !== 'set' && this.#cellPresentationMode !== 'permanently_set') this.#cellPresentationMode = undefined;
    this.#modeEvidence = undefined;
    this.#graphicsObserved = false;
    this.#graphicsFacts = this.#options.resolverInput.graphics;
    this.#probeFacts = { ...this.#configuredProbeFacts };
    this.#profile = this.#resolve();
  }

  async #probeGraphics(timeoutMs: number, ownerSignal?: AbortSignal): Promise<void> {
    await this.#options.input.settleResponseQuarantine(ownerSignal);
    ownerSignal?.throwIfAborted();
    const controller = probeController(timeoutMs, this.#options.clock, ownerSignal);
    let failure: unknown;
    let result: GraphicsProbeFacts | undefined;
    const session = await this.#options.beginSession('terminal-graphics-probe', this.#profile);
    try {
      const raw = await session.enableRawInput({ signal: controller.signal });
      if (raw.status === 'applied') {
        const inTmux = this.#options.resolverInput.environment?.variables?.['TMUX'] !== undefined;
        result = await this.#queryGraphics(controller.signal, inTmux);
      }
    } catch (cause) {
      failure = cause;
    } finally {
      controller.close();
      try {
        await this.#restoreProbeSession(session);
      } catch (cause) {
        failure = failure === undefined ? cause : new AggregateError([failure, cause], 'Terminal probing and restoration failed.');
      }
    }
    if (failure !== undefined) throw terminalProbeError(failure);
    if (result === undefined) return;
    this.#graphicsFacts = result;
    this.#graphicsObserved = true;
    this.#profile = this.#resolve();
  }

  async #queryGraphics(signal: AbortSignal, inTmux: boolean): Promise<GraphicsProbeFacts | undefined> {
    const sixel = await this.#queryTerminal(
      signal,
      createPrimaryDeviceAttributesResponseProtocol(),
      primaryDeviceAttributesQueryRequest(),
    );
    const cellPixels = await this.#queryTerminal(
      signal,
      createCellPixelGeometryResponseProtocol(),
      cellPixelGeometryQueryRequest(),
    );
    const passthrough = inTmux ? await this.#queryKittyPassthrough(signal) : undefined;
    const directKitty = inTmux
      ? undefined
      : await this.#queryTerminal(
          signal,
          createKittyGraphicsResponseProtocol(),
          kittyGraphicsQueryRequest(),
        );
    if (sixel === undefined && cellPixels === undefined && passthrough === undefined && directKitty === undefined) {
      return undefined;
    }
    const kittySupport = passthrough?.kitty ?? directKitty ?? 'unsupported';
    return Object.freeze({
      kitty: kittySupport,
      sixel: sixel ?? 'unsupported',
      ...(kittySupport === 'supported'
        ? { kittyTransport: passthrough?.kittyTransport ?? 'direct' as const }
        : {}),
      ...(cellPixels === undefined ? {} : { cellPixels }),
    });
  }

  async #queryTerminal<TValue>(
    signal: AbortSignal,
    protocol: import('./terminal-response.ts').TerminalResponseProtocol<TValue>,
    request: string,
  ): Promise<TValue | undefined> {
    if (signal.aborted) return undefined;
    const result = await this.#options.input.queryTerminal({
      signal,
      clock: this.#options.clock,
      protocol,
      send: async () => {
        requireCommittedTerminalWrite(await this.#options.write({ text: request }, signal));
      },
    });
    return result.status === 'matched' ? result.value : undefined;
  }

  async #queryKittyPassthrough(signal: AbortSignal): Promise<KittyGraphicsProbeFacts | undefined> {
    const result = await this.#options.input.queryTerminal({
      signal,
      clock: this.#options.clock,
      protocol: createKittyPassthroughResponseProtocol(),
      send: async () => {
        requireCommittedTerminalWrite(await this.#options.write({ text: kittyPassthroughQueryRequest() }, signal));
      },
    });
    return result.status === 'matched' ? result.value : undefined;
  }

  async #probeModes(timeoutMs: number, ownerSignal?: AbortSignal): Promise<void> {
    await this.#options.input.settleResponseQuarantine(ownerSignal);
    ownerSignal?.throwIfAborted();
    const operationController = probeController(timeoutMs, this.#options.clock, ownerSignal);
    let evidence: TerminalModeEvidence | undefined;
    let failure: unknown;
    const session = await this.#options.beginSession('terminal-mode-probe', this.#profile);
    try {
      const raw = await session.enableRawInput({ signal: operationController.signal });
      if (raw.status === 'applied') {
        const protocol = createTerminalModeResponseProtocol();
        const result = await this.#options.input.queryTerminal({
          signal: operationController.signal,
          clock: this.#options.clock,
          protocol,
          send: async () => {
            requireCommittedTerminalWrite(await this.#options.write(
              { text: terminalModeQueryRequest() },
              operationController.signal
            ));
          }
        });
        if (result.status === 'failed') failure = new Error('Terminal mode query write failed; presentation evidence is indeterminate.');
        else if (ownerSignal?.aborted !== true) evidence = protocol.evidence();
      }
    } catch (cause) {
      failure = cause;
    } finally {
      operationController.close();
      try {
        await this.#restoreProbeSession(session);
      } catch (cause) {
        failure = failure === undefined ? cause : new AggregateError([failure, cause], 'Terminal probing and restoration failed.');
      }
    }
    if (failure !== undefined) {
      this.#modeProbeFailed = true;
      this.#profile = this.#resolve();
      throw terminalProbeError(failure);
    }
    if (evidence === undefined) return;
    if (modeIsSet(evidence.reports['standard:8']) !== undefined && !evidence.conflictingModes.includes('standard:8')) this.#modeProbeFailed = false;
    this.#modeEvidence = evidence;
    for (const mode of Object.keys(evidence.reports) as TerminalModeKey[]) {
      if (modeIsSet(evidence.reports[mode]) !== undefined) this.#modeConflicts.delete(mode);
    }
    for (const mode of evidence.conflictingModes) this.#modeConflicts.add(mode);
    this.#recordModeProbe(evidence.reports);
    await this.#options.observeModes(evidence.reports, [...this.#modeConflicts]);
    this.#profile = this.#resolve();
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
        await this.#restoreProbeSession(session);
      } catch (cause) {
        failure = failure === undefined ? cause : new AggregateError([failure, cause], 'Terminal probing and restoration failed.');
      }
    }
    if (failure !== undefined) throw terminalProbeError(failure);
    if (observedProfile !== undefined) {
      await this.#options.observeKeyboardProfile(observedProfile);
    }
  }

  #recordModeProbe(reports: TerminalModeReports): void {
    const cellPresentation = reports['standard:8'];
    if (modeIsSet(cellPresentation) !== undefined
      || (this.#cellPresentationMode !== 'set' && this.#cellPresentationMode !== 'permanently_set')) this.#cellPresentationMode = cellPresentation;
    this.#probeFacts.cursorVisibility = modeSupport(reports['private:25'], this.#configuredProbeFacts.cursorVisibility);
    this.#probeFacts.focusReporting = modeSupport(reports['private:1004'], this.#configuredProbeFacts.focusReporting);
    this.#probeFacts.metaSendsEscape = modeSupport(reports['private:1036'], this.#configuredProbeFacts.metaSendsEscape);
    this.#probeFacts.alternateScreen = modeSupport(reports['private:1049'], this.#configuredProbeFacts.alternateScreen);
    this.#probeFacts.bracketedPaste = modeSupport(reports['private:2004'], this.#configuredProbeFacts.bracketedPaste);
    this.#probeFacts.mouseReporting = mouseModeSupport(reports, this.#configuredProbeFacts.mouseReporting);
    this.#probeFacts.unicodeGraphemeMode = modeSupport(reports['private:2027'], this.#configuredProbeFacts.unicodeGraphemeMode);
    this.#probeFacts.synchronizedOutput = reports['private:2026'] === 'set'
      ? 'unknown'
      : modeSupport(reports['private:2026'], this.#configuredProbeFacts.synchronizedOutput);
    this.#profile = this.#resolve();
  }

  #recordKeyboardProbe(support: 'supported' | 'unsupported' | 'unknown'): void {
    this.#probeFacts.keyboardProtocol = support;
    this.#profile = this.#resolve();
  }

  #resolve(): TerminalCapabilityProfile {
    const resolved = resolveTerminalCapabilities({
      ...this.#options.resolverInput,
      probes: this.#probeFacts,
      ...(this.#graphicsFacts === undefined ? {} : { graphics: this.#graphicsFacts })
    });
    const profile = { ...resolved, cellPresentation: this.resolveCellPresentation().capability };
    for (const mode of this.#modeConflicts) {
      if (mode === 'standard:8') continue;
      const capability = capabilityForMode(mode);
      const current = profile[capability];
      profile[capability] = Object.freeze({ ...current, support: 'unknown',
        facts: Object.freeze([...current.facts, Object.freeze({ kind: 'probe' as const, name: 'conflictingMode', value: mode })]),
        diagnostics: Object.freeze([diagnostic('HOST_CAPABILITY_UNKNOWN',
          `Conflicting ${mode} reports cannot establish ${capability}.`, { severity: 'warning', target: capability,
            data: { capability, reason: 'mode-reports-conflicting', mode } })]),
      });
    }
    if (this.#modeEvidence === undefined) return profile;
    return { ...profile, cellPresentation: Object.freeze({
      ...profile.cellPresentation,
      facts: Object.freeze([...profile.cellPresentation.facts, Object.freeze({ kind: 'probe' as const, name: 'terminalModes.collection', value: {
        complete: this.#modeEvidence.complete, missingModes: [...this.#modeEvidence.missingModes],
        conflictingModes: [...this.#modeEvidence.conflictingModes],
      }
      })]),
    }) };
  }

  async #restoreProbeSession(session: TerminalSession): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.#options.input.settleResponseQuarantine();
    } catch (cause) {
      failures.push(cause);
    }
    // Retirement failure never skips restoration, including a pre-existing raw
    // baseline which otherwise has no raw-off operation to drain responses.
    try {
      const restored = await session.restore('success');
      if (restored.status !== 'restored') failures.push(new Error('Terminal probing could not restore its temporary input session.'));
    } catch (cause) {
      failures.push(cause);
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Terminal probe response retirement or restoration failed.');
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
    const probes = [this.#modeProbe, this.#keyboardProbe, this.#graphicsProbe]
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
    (outcome) => {
      if (outcome === 'elapsed') operation.abort('terminal_capability_probe_timeout');
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

function modeSupport(
  report: TerminalModeReportState | undefined,
  configured: 'supported' | 'unsupported' | 'unknown' = 'unknown',
): 'supported' | 'unsupported' | 'unknown' {
  const mutable = modeIsMutable(report);
  // Only missing/unrecognized queries preserve independent operation evidence.
  // Recognized safety demotions, such as externally owned synchronized output,
  // are handled by their caller and must not fall back to configured support.
  return mutable === undefined ? configured : mutable ? 'supported' : 'unsupported';
}

function terminalProbeError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error('Terminal capability probing failed.', { cause });
}

function mouseModeSupport(
  reports: TerminalModeReports,
  configured: 'supported' | 'unsupported' | 'unknown' = 'unknown',
): 'supported' | 'unsupported' | 'unknown' {
  const encoding = modeSupport(reports['private:1006']);
  const tracking = [reports['private:1000'], reports['private:1002'], reports['private:1003']].map(report => modeSupport(report));
  if (encoding === 'unsupported' || tracking.every((support) => support === 'unsupported')) return 'unsupported';
  return encoding === 'supported' && tracking.some((support) => support === 'supported')
    ? 'supported'
    : configured;
}

function capabilityForMode(mode: TerminalModeKey): TerminalCapabilityName {
  switch (mode) {
    case 'standard:8': return 'cellPresentation';
    case 'private:25': return 'cursorVisibility';
    case 'private:1000':
    case 'private:1002':
    case 'private:1003':
    case 'private:1006': return 'mouseReporting';
    case 'private:1004': return 'focusReporting';
    case 'private:1036': return 'metaSendsEscape';
    case 'private:1049': return 'alternateScreen';
    case 'private:2004': return 'bracketedPaste';
    case 'private:2026': return 'synchronizedOutput';
    case 'private:2027': return 'unicodeGraphemeMode';
  }
}
