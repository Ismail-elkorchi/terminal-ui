import { diagnostic } from '../diagnostics.ts';
import { createProtocolWriter } from '../protocol/index.ts';
import { LEGACY_KEYBOARD_PROFILE, normalizeKeyboardProfile } from '../protocol/keyboard.ts';
import {
  terminalOperationApplied,
  terminalOperationIndeterminate,
  terminalOperationRejected
} from './operation-outcome.ts';
import { requireCommittedTerminalWrite, TerminalWriteError } from './write-receipt.ts';
import { createTerminalRestorePlan } from './session-restore.ts';
import { waitForTerminalOperation } from './operation.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';
import type { TerminalCapabilityName, TerminalCapabilityProfile } from './capability-types.ts';
import type {
  MouseReportingMode,
  TerminalHost,
  TerminalInitialState,
  TerminalOperationContext,
  TerminalOperationOutcome,
  TerminalRestoreOptions,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalStateChange,
  TerminalStateKnowledge,
  TerminalStateProvenanceSnapshot,
  TerminalStateSnapshot
} from './types.ts';

type TerminalStateKey = keyof Omit<TerminalStateSnapshot, 'provenance'>;

export interface TerminalStateAuthorityOptions {
  readonly rawInputKnowledge: TerminalStateKnowledge;
  readonly initialState?: TerminalInitialState;
}

export class TerminalStateAuthorityBinding {
  #authority: TerminalStateAuthority | undefined;

  bind(host: TerminalHost, options: TerminalStateAuthorityOptions): void {
    if (this.#authority !== undefined) throw new Error('Terminal state authority is already bound.');
    this.#authority = new TerminalStateAuthority(host, options);
  }

  beginLease(id: string, capabilities: TerminalCapabilityProfile): Promise<TerminalSession> {
    return this.authority().beginLease(id, capabilities);
  }

  restoreAll(
    reason: TerminalRestoreReason,
    options: TerminalRestoreOptions = {}
  ): Promise<TerminalRestoreResult> {
    return this.authority().restoreAll(reason, options);
  }

  recoverAll(
    reason: TerminalRestoreReason,
    options: TerminalRestoreOptions = {}
  ): Promise<TerminalRestoreResult> {
    return this.authority().recoverAll(reason, options);
  }

  async restoreAllConfirmed(
    reason: TerminalRestoreReason,
    context: TerminalOperationContext = {}
  ): Promise<void> {
    const result = await this.restoreAll(reason, {
      ...(context.signal === undefined ? {} : { operationSignal: context.signal })
    });
    if (result.status === 'restored') return;
    throw new Error(
      `Terminal state restoration ${result.status}: ${result.diagnostics.map((item) => item.message).join('; ') || 'state remains unconfirmed.'}`
    );
  }

  private authority(): TerminalStateAuthority {
    if (this.#authority === undefined) throw new Error('Terminal state authority is not bound.');
    return this.#authority;
  }
}

export class TerminalStateAuthority {
  readonly #host: TerminalHost;
  readonly #rawInputKnowledge: TerminalStateKnowledge;
  readonly #leases: TerminalSessionLease[] = [];
  readonly #uncertain = new Set<TerminalStateKey>();
  #current: TerminalStateSnapshot;
  #generation = 0;
  #tail: Promise<void> | undefined;

  constructor(host: TerminalHost, options: TerminalStateAuthorityOptions) {
    this.#host = host;
    this.#rawInputKnowledge = options.rawInputKnowledge;
    this.#current = initialTerminalState(host, options);
  }

  beginLease(id: string, capabilities: TerminalCapabilityProfile): Promise<TerminalSession> {
    return this.runExclusive(() => {
      const rawInput = this.#host.stdin.isRawModeEnabled?.();
      if (rawInput !== undefined && this.#current.provenance.rawInput !== 'explicit') {
        this.setKnown('rawInput', rawInput, this.#rawInputKnowledge);
      }
      const lease = new TerminalSessionLease(id, this.#host, capabilities, this, this.snapshot());
      this.#leases.push(lease);
      return Promise.resolve(lease);
    });
  }

  snapshot(): TerminalStateSnapshot {
    return cloneTerminalState(this.#current, this.#uncertain);
  }

  isActive(lease: TerminalSessionLease): boolean {
    return this.#leases.at(-1) === lease;
  }

  async mutate<K extends TerminalStateKey>(
    lease: TerminalSessionLease,
    kind: K,
    enabled: TerminalStateSnapshot[K],
    apply: (context: TerminalOperationContext) => void | Promise<void>,
    context: TerminalOperationContext = {},
    equal: (current: TerminalStateSnapshot[K], next: TerminalStateSnapshot[K]) => boolean = Object.is
  ): Promise<TerminalOperationOutcome> {
    return this.runExclusive(async (generation) => {
      const inactive = this.inactiveLeaseDiagnostic(lease);
      if (inactive !== undefined) return terminalOperationRejected(inactive);
      const change = { kind, enabled } as TerminalStateChange;
      const cancellation = cancelledOperationDiagnostic(lease, context);
      if (cancellation !== undefined) return terminalOperationRejected(cancellation);
      if (equal(this.#current[kind], enabled) && !this.#uncertain.has(kind)) {
        return terminalOperationApplied(change);
      }
      this.#uncertain.add(kind);
      try {
        await apply(context);
      } catch (cause) {
        if (!this.isCurrentGeneration(generation)) {
          return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
        }
        if (cause instanceof TerminalWriteError && cause.receipt.status === 'failed_before_write') {
          this.#uncertain.delete(kind);
          return terminalOperationRejected(cause.receipt.diagnostic);
        }
        this.markIndeterminate(kind);
        return terminalOperationIndeterminate(change, indeterminateOperationDiagnostic(lease, change, cause));
      }
      if (!this.isCurrentGeneration(generation)) {
        return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
      }
      this.setKnown(kind, enabled, knowledgeAfterMutation(kind, this.#host));
      return terminalOperationApplied(change);
    });
  }

  async setKeyboardProfile(
    lease: TerminalSessionLease,
    profile: TerminalKeyboardProfile,
    context: TerminalOperationContext = {}
  ): Promise<TerminalOperationOutcome> {
    return this.runExclusive(async (generation) => {
      const inactive = this.inactiveLeaseDiagnostic(lease);
      if (inactive !== undefined) return terminalOperationRejected(inactive);
      const normalized = normalizeKeyboardProfile(profile);
      const change = { kind: 'keyboardProfile', enabled: normalized } as const;
      const cancellation = cancelledOperationDiagnostic(lease, context);
      if (cancellation !== undefined) return terminalOperationRejected(cancellation);
      if (keyboardProfilesEqual(this.#current.keyboardProfile, normalized) && !this.#uncertain.has('keyboardProfile')) {
        return terminalOperationApplied(change);
      }
      this.#uncertain.add('keyboardProfile');
      try {
        if (lease.keyboardFrameState === 'none') {
          lease.beginKeyboardFramePush();
          await this.protocol(context).pushKeyboardProfile(normalized);
          lease.confirmKeyboardFramePush();
        } else if (lease.keyboardFrameState === 'owned') {
          await this.protocol(context).setKeyboardProfile(normalized);
        } else {
          throw new Error(`Keyboard frame state is indeterminate: ${lease.keyboardFrameState}.`);
        }
      } catch (cause) {
        if (!this.isCurrentGeneration(generation)) {
          return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
        }
        if (cause instanceof TerminalWriteError && cause.receipt.status === 'failed_before_write') {
          this.#uncertain.delete('keyboardProfile');
          lease.cancelKeyboardFramePush();
          return terminalOperationRejected(cause.receipt.diagnostic);
        }
        this.markIndeterminate('keyboardProfile');
        return terminalOperationIndeterminate(change, indeterminateOperationDiagnostic(lease, change, cause));
      }
      if (!this.isCurrentGeneration(generation)) {
        return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
      }
      this.setKnown('keyboardProfile', normalized, 'library_known');
      return terminalOperationApplied(change);
    });
  }

  restore(
    lease: TerminalSessionLease,
    reason: TerminalRestoreReason,
    context: TerminalOperationContext = {}
  ): Promise<TerminalRestoreResult> {
    return this.runExclusive((generation) => this.restoreLease(lease, reason, context, generation));
  }

  async restoreAll(
    reason: TerminalRestoreReason,
    options: TerminalRestoreOptions = {}
  ): Promise<TerminalRestoreResult> {
    const results: TerminalRestoreResult[] = [];
    while (this.#leases.length > 0) {
      const lease = this.#leases.at(-1);
      if (lease === undefined) break;
      const result = await lease.restore(reason, options);
      results.push(result);
      if (result.status !== 'restored') break;
    }
    if (results.length === 0) {
      const snapshot = this.snapshot();
      return {
        status: 'restored', reason, requested: snapshot, attempted: [], confirmed: [], resultingState: snapshot, diagnostics: []
      };
    }
    return aggregateRestoreResults(results, reason);
  }

  recoverAll(
    reason: TerminalRestoreReason,
    options: TerminalRestoreOptions = {}
  ): Promise<TerminalRestoreResult> {
    const generation = this.#generation + 1;
    this.#generation = generation;
    const operationContext = options.operationSignal === undefined
      ? {}
      : { signal: options.operationSignal };
    const recovery = this.restoreAllDirect(reason, operationContext, generation);
    const settled = recovery.then(() => undefined, () => undefined);
    this.#tail = settled;
    void settled.then(() => {
      if (this.#tail === settled) this.#tail = undefined;
    });
    const waitContext = options.waitSignal === undefined ? {} : { signal: options.waitSignal };
    return waitForTerminalOperation(recovery, waitContext);
  }

  private async restoreAllDirect(
    reason: TerminalRestoreReason,
    context: TerminalOperationContext,
    generation: number
  ): Promise<TerminalRestoreResult> {
    const results: TerminalRestoreResult[] = [];
    while (this.isCurrentGeneration(generation) && this.#leases.length > 0) {
      const lease = this.#leases.at(-1);
      if (lease === undefined) break;
      const result = await this.restoreLease(lease, reason, context, generation);
      results.push(result);
      if (result.status !== 'restored') break;
    }
    if (results.length === 0) {
      const snapshot = this.snapshot();
      return {
        status: 'restored',
        reason,
        requested: snapshot,
        attempted: [],
        confirmed: [],
        resultingState: snapshot,
        diagnostics: []
      };
    }
    return aggregateRestoreResults(results, reason);
  }

  private async restoreLease(
    lease: TerminalSessionLease,
    reason: TerminalRestoreReason,
    context: TerminalOperationContext,
    generation: number
  ): Promise<TerminalRestoreResult> {
    const inactive = this.inactiveLeaseDiagnostic(lease);
    if (inactive !== undefined) {
      return this.recordRestore(failedRestore(lease.initialState, reason, this.snapshot(), [inactive]));
    }
    if (!this.isCurrentGeneration(generation)) {
      return this.recordRestore(supersededRestore(lease, reason, this.snapshot()));
    }
    if (restoreWasCancelled(context)) {
      const result = cancelledRestore(lease, reason, this.snapshot(), context.signal);
      return this.recordRestore(result);
    }
    const attempted: TerminalStateChange[] = [];
    const confirmed: TerminalStateChange[] = [];
    const diagnostics: TerminalDiagnostic[] = [];
    for (const operation of createTerminalRestorePlan(lease.initialState).operations) {
      if (!this.isCurrentGeneration(generation)) {
        diagnostics.push(supersededRestoreDiagnostic(lease));
        break;
      }
      if (restoreWasCancelled(context)) {
        diagnostics.push(restoreCancellationDiagnostic(lease, context.signal, operation.kind));
        break;
      }
      const stateMatches = operation.kind === 'keyboardProfile'
        ? keyboardProfilesEqual(this.#current.keyboardProfile, operation.enabled)
        : Object.is(this.#current[operation.kind], operation.enabled);
      const hasKeyboardFrame = operation.kind === 'keyboardProfile'
        && lease.keyboardFrameState !== 'none';
      if (stateMatches && !hasKeyboardFrame && !this.#uncertain.has(operation.kind)) continue;
      attempted.push(operation);
      try {
        await this.applyRestoreOperation(lease, operation, context);
        if (!this.isCurrentGeneration(generation)) {
          diagnostics.push(supersededRestoreDiagnostic(lease, operation.kind));
          break;
        }
        this.setKnown(operation.kind, operation.enabled, knowledgeAfterMutation(operation.kind, this.#host));
        confirmed.push(operation);
        if (restoreWasCancelled(context)) {
          diagnostics.push(restoreCancellationDiagnostic(lease, context.signal, operation.kind));
          break;
        }
      } catch (cause) {
        if (!this.isCurrentGeneration(generation)) {
          diagnostics.push(supersededRestoreDiagnostic(lease, operation.kind, cause));
          break;
        }
        this.markIndeterminate(operation.kind);
        if (restoreWasCancelled(context)) {
          diagnostics.push(restoreCancellationDiagnostic(lease, context.signal, operation.kind, cause));
          break;
        }
        diagnostics.push(diagnostic('HOST_RESTORE_FAILED', `Failed to restore terminal state: ${operation.kind}.`, {
          severity: 'error',
          target: lease.id,
          cause,
          data: { operation: operation.kind }
        }));
      }
    }
    const resultingState = this.snapshot();
    const status = diagnostics.length === 0 ? 'restored' : confirmed.length === 0 ? 'failed' : 'partial';
    const result: TerminalRestoreResult = {
      status,
      reason,
      requested: lease.initialState,
      attempted,
      confirmed,
      resultingState,
      diagnostics
    };
    if (status === 'restored') {
      this.removeActiveLease(lease);
      lease.completeRestore(result);
    }
    return this.recordRestore(result);
  }

  private async applyRestoreOperation(
    lease: TerminalSessionLease,
    operation: TerminalStateChange,
    context: TerminalOperationContext
  ): Promise<void> {
    const protocol = this.recoveryProtocol(context);
    switch (operation.kind) {
      case 'cursorVisible':
        await (operation.enabled ? protocol.showCursor() : protocol.hideCursor());
        break;
      case 'focusReporting':
        await (operation.enabled ? protocol.enableFocusReporting() : protocol.disableFocusReporting());
        break;
      case 'keyboardProfile':
        await lease.restoreKeyboardFrame(protocol);
        break;
      case 'mouseReporting':
        await (operation.enabled === 'none'
          ? protocol.disableMouseReporting()
          : protocol.enableMouseReporting(operation.enabled));
        break;
      case 'bracketedPaste':
        await (operation.enabled ? protocol.enableBracketedPaste() : protocol.disableBracketedPaste());
        break;
      case 'alternateScreen':
        await (operation.enabled ? protocol.enableAlternateScreen() : protocol.disableAlternateScreen());
        break;
      case 'rawInput':
        await this.#host.stdin.setRawMode?.(operation.enabled);
        break;
    }
  }

  private setKnown<K extends TerminalStateKey>(
    kind: K,
    value: TerminalStateSnapshot[K],
    knowledge: TerminalStateKnowledge
  ): void {
    this.#current = {
      ...this.#current,
      [kind]: value,
      provenance: { ...this.#current.provenance, [kind]: knowledge }
    };
    this.#uncertain.delete(kind);
  }

  private markIndeterminate(kind: TerminalStateKey): void {
    this.#uncertain.add(kind);
    this.#current = {
      ...this.#current,
      provenance: { ...this.#current.provenance, [kind]: 'indeterminate' }
    };
  }

  private inactiveLeaseDiagnostic(lease: TerminalSessionLease): TerminalDiagnostic | undefined {
    if (this.isActive(lease)) return undefined;
    return diagnostic('HOST_PROTOCOL_LEASE_INACTIVE', 'Terminal session is not the active host lease.', {
      severity: 'error',
      target: lease.id
    });
  }

  private recordRestore(result: TerminalRestoreResult): TerminalRestoreResult {
    this.#host.observer?.recordRestore?.(result);
    return result;
  }

  private removeActiveLease(lease: TerminalSessionLease): void {
    const active = this.#leases.at(-1);
    if (active !== lease) {
      throw new Error(`Terminal lease stack invariant failed while restoring ${lease.id}.`);
    }
    this.#leases.pop();
  }

  private runExclusive<T>(operation: (generation: number) => Promise<T>): Promise<T> {
    const generation = this.#generation;
    const run = (): Promise<T> => {
      if (!this.isCurrentGeneration(generation)) {
        return Promise.reject(new Error('Terminal state operation was superseded by emergency recovery.'));
      }
      return operation(generation);
    };
    const result = this.#tail === undefined ? run() : this.#tail.then(run, run);
    const settled = result.then(() => undefined, () => undefined);
    this.#tail = settled;
    void settled.then(() => {
      if (this.#tail === settled) this.#tail = undefined;
    });
    return result;
  }

  private isCurrentGeneration(generation: number): boolean {
    return generation === this.#generation;
  }

  private protocol(context: TerminalOperationContext): ReturnType<typeof createProtocolWriter> {
    return createProtocolWriter({
      write: async (sequence) => {
        requireCommittedTerminalWrite(await this.#host.write({ text: sequence }, context));
      }
    });
  }

  private recoveryProtocol(context: TerminalOperationContext): ReturnType<typeof createProtocolWriter> {
    return createProtocolWriter({
      write: async (sequence) => {
        requireCommittedTerminalWrite(await this.#host.writeRecovery({ text: sequence }, context));
      }
    });
  }
}

class TerminalSessionLease implements TerminalSession {
  readonly id: string;
  readonly host: TerminalHost;
  readonly capabilities: TerminalCapabilityProfile;
  readonly initialState: TerminalStateSnapshot;
  readonly #authority: TerminalStateAuthority;
  #completedRestore: Promise<TerminalRestoreResult> | undefined;
  #restoreAttempt: RestoreAttempt | undefined;
  #keyboardFrameState: KeyboardFrameState = 'none';

  constructor(
    id: string,
    host: TerminalHost,
    capabilities: TerminalCapabilityProfile,
    authority: TerminalStateAuthority,
    initialState: TerminalStateSnapshot
  ) {
    this.id = id;
    this.host = host;
    this.capabilities = capabilities;
    this.#authority = authority;
    this.initialState = initialState;
  }

  enableRawInput(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('rawInput', true, () => this.host.stdin.setRawMode?.(true), context);
  }

  enableAlternateScreen(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('alternateScreen', true, (operationContext) =>
      this.protocol(operationContext).enableAlternateScreen(), context);
  }

  enableBracketedPaste(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('bracketedPaste', true, (operationContext) =>
      this.protocol(operationContext).enableBracketedPaste(), context);
  }

  enableMouseReporting(
    mode: MouseReportingMode = 'click',
    context: TerminalOperationContext = {}
  ): Promise<TerminalOperationOutcome> {
    return this.mutate('mouseReporting', mode, (operationContext) =>
      this.protocol(operationContext).enableMouseReporting(mode), context);
  }

  enableFocusReporting(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('focusReporting', true, (operationContext) =>
      this.protocol(operationContext).enableFocusReporting(), context);
  }

  async enableKeyboardProfile(
    profile: TerminalKeyboardProfile,
    context: TerminalOperationContext = {}
  ): Promise<TerminalOperationOutcome> {
    const support = this.requireCapability('keyboardProtocol');
    if (support !== undefined && profile.kind !== 'legacy') return support;
    return this.#authority.setKeyboardProfile(this, profile, context);
  }

  get keyboardFrameState(): KeyboardFrameState {
    return this.#keyboardFrameState;
  }

  beginKeyboardFramePush(): void {
    if (this.#keyboardFrameState !== 'none') {
      throw new Error(`Cannot push a keyboard frame from state ${this.#keyboardFrameState}.`);
    }
    this.#keyboardFrameState = 'push_uncertain';
  }

  confirmKeyboardFramePush(): void {
    if (this.#keyboardFrameState !== 'push_uncertain') {
      throw new Error(`Cannot confirm a keyboard frame from state ${this.#keyboardFrameState}.`);
    }
    this.#keyboardFrameState = 'owned';
  }

  cancelKeyboardFramePush(): void {
    if (this.#keyboardFrameState === 'push_uncertain') this.#keyboardFrameState = 'none';
  }

  async restoreKeyboardFrame(protocol: ReturnType<typeof createProtocolWriter>): Promise<void> {
    if (this.#keyboardFrameState === 'none') return;
    if (this.#keyboardFrameState === 'pop_uncertain') {
      throw new Error('Keyboard frame pop has an indeterminate outcome and cannot be repeated safely.');
    }
    this.#keyboardFrameState = 'pop_uncertain';
    await protocol.popKeyboardProfile();
    this.#keyboardFrameState = 'none';
  }

  hideCursor(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('cursorVisible', false, (operationContext) => this.protocol(operationContext).hideCursor(), context);
  }

  showCursor(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('cursorVisible', true, (operationContext) => this.protocol(operationContext).showCursor(), context);
  }

  restore(
    reason: TerminalRestoreReason = 'success',
    options: TerminalRestoreOptions = {}
  ): Promise<TerminalRestoreResult> {
    const waitContext = options.waitSignal === undefined ? {} : { signal: options.waitSignal };
    if (this.#completedRestore !== undefined) return this.#completedRestore;
    const activeAttempt = this.#restoreAttempt;
    if (activeAttempt !== undefined) return waitForTerminalOperation(activeAttempt.promise, waitContext);
    const operationContext = options.operationSignal === undefined ? {} : { signal: options.operationSignal };
    const restoring = this.#authority.restore(this, reason, operationContext);
    const completion = restoring.then((result) => {
      if (this.#restoreAttempt?.promise === completion) this.#restoreAttempt = undefined;
      return result;
    }, (cause: unknown) => {
      if (this.#restoreAttempt?.promise === completion) this.#restoreAttempt = undefined;
      throw cause;
    });
    this.#restoreAttempt = { promise: completion };
    return waitForTerminalOperation(completion, waitContext);
  }

  completeRestore(result: TerminalRestoreResult): void {
    if (result.status !== 'restored') {
      throw new Error('Only a successful terminal restoration can complete a session lease.');
    }
    this.#completedRestore = Promise.resolve(result);
  }

  private mutate<K extends TerminalStateKey>(
    kind: K,
    enabled: TerminalStateSnapshot[K],
    apply: (context: TerminalOperationContext) => void | Promise<void>,
    context: TerminalOperationContext
  ): Promise<TerminalOperationOutcome> {
    const capability = capabilityForState(kind);
    const support = this.requireCapability(capability);
    if (support !== undefined) return Promise.resolve(support);
    return this.#authority.mutate(this, kind, enabled, apply, context);
  }

  private requireCapability(kind: TerminalCapabilityName): TerminalOperationOutcome | undefined {
    const capability = this.capabilities[kind];
    if (capability.support === 'supported' && capability.availability === 'available') return undefined;
    return terminalOperationRejected(diagnostic('HOST_PROTOCOL_UNSUPPORTED', `Terminal protocol is unavailable: ${kind}.`, {
      severity: 'warning',
      target: this.id,
      data: {
        capability: kind,
        support: capability.support,
        availability: capability.availability,
        diagnostics: capability.diagnostics.map((item) => item.message)
      }
    }));
  }

  private protocol(context: TerminalOperationContext): ReturnType<typeof createProtocolWriter> {
    return createProtocolWriter({
      write: async (sequence) => {
        requireCommittedTerminalWrite(await this.host.write({ text: sequence }, context));
      }
    });
  }
}

interface RestoreAttempt {
  readonly promise: Promise<TerminalRestoreResult>;
}

type KeyboardFrameState = 'none' | 'push_uncertain' | 'owned' | 'pop_uncertain';

function initialTerminalState(
  host: TerminalHost,
  options: TerminalStateAuthorityOptions
): TerminalStateSnapshot {
  const explicit = options.initialState ?? {};
  const rawInput = explicit.rawInput ?? host.stdin.isRawModeEnabled?.() ?? false;
  const values = {
    rawInput,
    alternateScreen: explicit.alternateScreen ?? false,
    bracketedPaste: explicit.bracketedPaste ?? false,
    mouseReporting: explicit.mouseReporting ?? 'none',
    focusReporting: explicit.focusReporting ?? false,
    keyboardProfile: explicit.keyboardProfile === undefined
      ? LEGACY_KEYBOARD_PROFILE
      : normalizeKeyboardProfile(explicit.keyboardProfile),
    cursorVisible: explicit.cursorVisible ?? true
  } satisfies Omit<TerminalStateSnapshot, 'provenance'>;
  const provenance = Object.fromEntries(
    (Object.keys(values) as TerminalStateKey[]).map((key) => [
      key,
      key in explicit ? 'explicit' : key === 'rawInput' ? options.rawInputKnowledge : 'assumed'
    ])
  ) as unknown as TerminalStateProvenanceSnapshot;
  return { ...values, provenance };
}

function cloneTerminalState(
  state: TerminalStateSnapshot,
  uncertain: ReadonlySet<TerminalStateKey>
): TerminalStateSnapshot {
  const provenance = { ...state.provenance };
  for (const key of uncertain) provenance[key] = 'indeterminate';
  return { ...state, keyboardProfile: { ...state.keyboardProfile }, provenance };
}

function knowledgeAfterMutation(kind: TerminalStateKey, host: TerminalHost): TerminalStateKnowledge {
  return kind === 'rawInput' && host.stdin.isRawModeEnabled !== undefined ? 'observed' : 'library_known';
}

function capabilityForState(kind: TerminalStateKey): TerminalCapabilityName {
  switch (kind) {
    case 'rawInput': return 'rawInput';
    case 'alternateScreen': return 'alternateScreen';
    case 'bracketedPaste': return 'bracketedPaste';
    case 'mouseReporting': return 'mouseReporting';
    case 'focusReporting': return 'focusReporting';
    case 'keyboardProfile': return 'keyboardProtocol';
    case 'cursorVisible': return 'cursorVisibility';
  }
}

function cancelledOperationDiagnostic(
  lease: TerminalSessionLease,
  context: TerminalOperationContext
): TerminalDiagnostic | undefined {
  if (context.signal?.aborted !== true) return undefined;
  return diagnostic('HOST_OPERATION_CANCELLED', 'Terminal operation was cancelled before it started.', {
    severity: 'warning',
    target: lease.id
  });
}

function indeterminateOperationDiagnostic(
  lease: TerminalSessionLease,
  change: TerminalStateChange,
  cause: unknown
): TerminalDiagnostic {
  return diagnostic('HOST_OUTPUT_INDETERMINATE', `Terminal operation outcome is indeterminate: ${change.kind}.`, {
    severity: 'error',
    target: lease.id,
    cause,
    data: { operation: change.kind }
  });
}

function supersededOperationDiagnostic(
  lease: TerminalSessionLease,
  change: TerminalStateChange
): TerminalDiagnostic {
  return indeterminateOperationDiagnostic(
    lease,
    change,
    new Error('Terminal operation was superseded by emergency recovery.')
  );
}

function keyboardProfilesEqual(left: TerminalKeyboardProfile, right: TerminalKeyboardProfile): boolean {
  return left.kind === right.kind
    && (left.kind === 'legacy' || (right.kind === 'kitty' && left.flags === right.flags));
}

function failedRestore(
  requested: TerminalStateSnapshot,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot,
  diagnostics: readonly TerminalDiagnostic[]
): TerminalRestoreResult {
  return { status: 'failed', reason, requested, attempted: [], confirmed: [], resultingState, diagnostics };
}

function supersededRestore(
  lease: TerminalSessionLease,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot
): TerminalRestoreResult {
  return failedRestore(lease.initialState, reason, resultingState, [
    supersededRestoreDiagnostic(lease)
  ]);
}

function supersededRestoreDiagnostic(
  lease: TerminalSessionLease,
  operation?: TerminalStateKey,
  cause?: unknown
): TerminalDiagnostic {
  return diagnostic('HOST_RESTORE_FAILED', operation === undefined
    ? 'Terminal restoration was superseded by emergency recovery.'
    : `Terminal restoration was superseded while restoring terminal state: ${operation}.`, {
    severity: 'error',
    target: lease.id,
    ...(cause === undefined ? {} : { cause }),
    data: {
      superseded: true,
      ...(operation === undefined ? {} : { operation })
    }
  });
}

function cancelledRestore(
  lease: TerminalSessionLease,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot,
  signal: AbortSignal
): TerminalRestoreResult {
  return failedRestore(lease.initialState, reason, resultingState, [
    restoreCancellationDiagnostic(lease, signal)
  ]);
}

function restoreCancellationDiagnostic(
  lease: TerminalSessionLease,
  signal: AbortSignal,
  operation?: TerminalStateKey,
  cause: unknown = signal.reason
): TerminalDiagnostic {
  return diagnostic('HOST_RESTORE_FAILED', operation === undefined
    ? 'Terminal restoration was not started because finalization had expired.'
    : `Terminal restoration expired while restoring terminal state: ${operation}.`, {
    severity: 'error',
    target: lease.id,
    cause,
    data: {
      cancelled: true,
      ...(operation === undefined ? {} : { operation })
    }
  });
}

function restoreWasCancelled(context: TerminalOperationContext): context is { readonly signal: AbortSignal } {
  return context.signal?.aborted === true;
}

function aggregateRestoreResults(
  results: readonly TerminalRestoreResult[],
  reason: TerminalRestoreReason
): TerminalRestoreResult {
  const first = results[0];
  const last = results.at(-1);
  if (first === undefined || last === undefined) throw new Error('Terminal restore aggregation invariant failed.');
  const diagnostics = results.flatMap((item) => item.diagnostics);
  const confirmed = results.flatMap((item) => item.confirmed);
  return {
    status: diagnostics.length === 0 ? 'restored' : confirmed.length === 0 ? 'failed' : 'partial',
    reason,
    requested: last.requested,
    attempted: results.flatMap((item) => item.attempted),
    confirmed,
    resultingState: last.resultingState,
    diagnostics
  };
}
