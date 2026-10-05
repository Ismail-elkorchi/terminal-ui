import type { TerminalDiagnostic } from '../diagnostics.ts';
import { diagnostic } from '../diagnostics.ts';
import type { MouseReportingMode } from '../protocol/index.ts';
import { createProtocolWriter } from '../protocol/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';
import { decodeKeyboardProfile, LEGACY_KEYBOARD_PROFILE } from '../protocol/keyboard.ts';
import { decodeCellPresentationQualification } from './capabilities.ts';
import type { TerminalCapabilityName, TerminalCapabilityProfile } from './capability-types.ts';
import {
  terminalOperationApplied,
  terminalOperationIndeterminate,
  terminalOperationRejected,
} from './operation-outcome.ts';
import { waitForTerminalOperation } from './operation.ts';
import { createTerminalRestorePlan } from './session-restore.ts';
import type { TerminalModeKey, TerminalModeReports, TerminalModeReportState } from './terminal-mode-query.ts';
import { modeIsMutable, modeIsSet } from './terminal-mode-query.ts';
import type {
  KeyboardFrame,
  KeyboardFrameState,
  KeyboardScreenState,
  RestoreAttempt,
  RestoredKeyboardFrame,
  RestoreOperationOutcome,
  TerminalScreen,
  TerminalStateAuthorityOptions,
  TerminalStateKey,
  TerminalStateStorage,
  TerminalRestorableStateChange,
} from './terminal-state/contracts.ts';
import {
  aggregateRestoreResults,
  assuranceForKnowledge,
  cancelledOperationDiagnostic,
  cancelledRestore,
  capabilityForState,
  failedRestore,
  freezeRestoreResult,
  indeterminateOperationDiagnostic,
  modeTransitionDiagnostic,
  requestedTerminalModes,
  rawInputObservationMismatchDiagnostic,
  restoreCancellationDiagnostic,
  restoreWasCancelled,
  supersededOperationDiagnostic,
  supersededRestore,
  supersededRestoreDiagnostic,
  unavailableCapabilityOutcome,
} from './terminal-state/outcomes.ts';
import {
  cloneTerminalState,
  freezeTerminalState,
  initialTerminalState,
  keyboardProfilesEqual,
  keyboardScreenState,
  knowledgeAfterMutation,
  otherTerminalScreen,
  sameMouseReportingState,
  terminalScreen,
} from './terminal-state/snapshot.ts';
import type {
  TerminalHost,
  TerminalOperationContext,
  TerminalOperationOutcome,
  TerminalRestoreCompletion,
  TerminalRestoreOptions,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalStateChange,
  TerminalStateKnowledge,
  TerminalStateSnapshot,
} from './types.ts';
import { requireCommittedTerminalWrite, TerminalWriteError } from './write-receipt.ts';



export class TerminalStateAuthorityBinding {
  #authority: TerminalStateAuthority | undefined;

  bind(host: TerminalHost, options: TerminalStateAuthorityOptions): void {
    if (this.#authority !== undefined) throw new Error('Terminal state authority is already bound.');
    this.#authority = new TerminalStateAuthority(host, options);
  }

  beginLease(id: string, capabilities: TerminalCapabilityProfile): Promise<TerminalSession> {
    return this.authority().beginLease(id, capabilities);
  }

  observeModes(reports: TerminalModeReports, conflictingModes: readonly TerminalModeKey[] = []): Promise<void> {
    return this.authority().observeModes(reports, conflictingModes);
  }

  observeKeyboardProfile(profile: TerminalKeyboardProfile): Promise<void> {
    return this.authority().observeKeyboardProfile(profile);
  }

  beginObservationRefresh(): Promise<void> {
    return this.authority().beginObservationRefresh();
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
  readonly #cellPresentation: TerminalStateAuthorityOptions['cellPresentation'];
  readonly #rawInputKnowledge: TerminalStateKnowledge;
  readonly #verifyKeyboardProfile: TerminalStateAuthorityOptions['verifyKeyboardProfile'];
  readonly #observeBidiMode: TerminalStateAuthorityOptions['observeBidiMode'];
  readonly #leases: TerminalSessionLease[] = [];
  readonly #uncertain = new Set<TerminalStateKey>();
  readonly #initial: TerminalStateStorage;
  readonly #initialKeyboardByScreen: Readonly<Record<TerminalScreen, KeyboardScreenState>>;
  readonly #keyboardByScreen: Record<TerminalScreen, KeyboardScreenState>;
  #modeConflicts = new Set<TerminalModeKey>();
  #modeReports: TerminalModeReports = Object.freeze({});
  #current: TerminalStateStorage;
  #generation = 0;
  #cellPresentationQualificationInvalidated = false;
  #tail: Promise<void> | undefined;

  constructor(host: TerminalHost, options: TerminalStateAuthorityOptions) {
    this.#host = host;
    this.#cellPresentation = decodeCellPresentationQualification(options.cellPresentation);
    this.#rawInputKnowledge = options.rawInputKnowledge;
    this.#verifyKeyboardProfile = options.verifyKeyboardProfile;
    this.#observeBidiMode = options.observeBidiMode;
    this.#initial = initialTerminalState(host, options);
    this.#current = this.#initial;
    this.#cellPresentationQualificationInvalidated = this.#cellPresentation?.qualification === 'existing'
      && this.#initial.bidiMode === 'implicit';
    const initialScreen = terminalScreen(this.#initial.alternateScreen);
    const inactiveScreen = otherTerminalScreen(initialScreen);
    const initialActiveKeyboard = keyboardScreenState(
      this.#initial.keyboardProfile,
      this.#initial.provenance.keyboardProfile
    );
    const initialInactiveKeyboard = keyboardScreenState(LEGACY_KEYBOARD_PROFILE, 'assumed');
    this.#initialKeyboardByScreen = Object.freeze({
      [initialScreen]: initialActiveKeyboard,
      [inactiveScreen]: initialInactiveKeyboard
    }) as Readonly<Record<TerminalScreen, KeyboardScreenState>>;
    this.#keyboardByScreen = {
      main: this.#initialKeyboardByScreen.main,
      alternate: this.#initialKeyboardByScreen.alternate
    };
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

  beginObservationRefresh(): Promise<void> {
    return this.runExclusive(() => {
      if (this.#leases.length > 0) {
        throw new Error('Terminal observations cannot be refreshed while a terminal session is active.');
      }
      this.resetObservedState();
      this.#modeReports = Object.freeze({});
      return Promise.resolve();
    });
  }

  observeModes(reports: TerminalModeReports, conflictingModes: readonly TerminalModeKey[] = []): Promise<void> {
    return this.runExclusive(() => {
      if (this.#leases.length > 0) {
        throw new Error('Terminal modes cannot be observed while a terminal session is active.');
      }
      this.resetObservedModes();
      this.#modeReports = Object.freeze({ ...reports });
      this.#modeConflicts = new Set(conflictingModes);
      const implicit = modeIsSet(reports['standard:8']);
      if ((implicit === true || conflictingModes.includes('standard:8')) && this.#cellPresentation?.qualification === 'existing') this.#cellPresentationQualificationInvalidated = true;
      if (implicit !== undefined) this.setKnown('bidiMode', implicit ? 'implicit' : 'explicit', 'observed');
      this.observeBooleanMode('cursorVisible', reports['private:25']);
      this.observeBooleanMode('focusReporting', reports['private:1004']);
      this.observeBooleanMode('metaSendsEscape', reports['private:1036']);
      this.observeBooleanMode('alternateScreen', reports['private:1049']);
      this.observeBooleanMode('bracketedPaste', reports['private:2004']);
      this.observeBooleanMode('unicodeGraphemeMode', reports['private:2027']);
      this.observeMouseModes(reports);
      this.markConflictedModes();
      return Promise.resolve();
    });
  }

  observeKeyboardProfile(profile: TerminalKeyboardProfile): Promise<void> {
    return this.runExclusive(() => {
      if (this.#leases.length > 0) {
        throw new Error('Terminal keyboard state cannot be observed while a terminal session is active.');
      }
      if (this.#current.provenance.keyboardProfile !== 'explicit') {
        this.setKnown('keyboardProfile', decodeKeyboardProfile(profile), 'observed');
      }
      return Promise.resolve();
    });
  }

  snapshot(): TerminalStateSnapshot {
    const state = cloneTerminalState(this.#current, this.#uncertain);
    const uncertain = state.provenance.bidiMode === 'indeterminate';
    const qualified = !uncertain && !this.#cellPresentationQualificationInvalidated
      && (this.#cellPresentation?.qualification === 'existing'
        || this.#cellPresentation?.qualification === 'mode-8-reset'
          && state.bidiMode === 'explicit' && state.provenance.bidiMode === 'observed');
    return Object.freeze({ ...state,
      cellPresentation: qualified ? 'application-ordered' : 'unknown',
      provenance: Object.freeze({ ...state.provenance,
        cellPresentation: qualified ? 'explicit' : uncertain ? 'indeterminate' : 'assumed' }),
    });
  }

  currentState(lease: TerminalSessionLease): Promise<TerminalStateSnapshot> {
    return this.runExclusive(() => {
      const inactive = this.inactiveLeaseDiagnostic(lease);
      if (inactive !== undefined) throw new Error(inactive.message);
      return Promise.resolve(this.snapshot());
    });
  }

  isActive(lease: TerminalSessionLease): boolean {
    return this.#leases.at(-1) === lease;
  }

  async mutate<K extends TerminalStateKey>(
    lease: TerminalSessionLease,
    kind: K,
    nextState: TerminalStateStorage[K],
    apply: (context: TerminalOperationContext) => void | Promise<void>,
    context: TerminalOperationContext = {},
    equal: (current: TerminalStateStorage[K], next: TerminalStateStorage[K]) => boolean = Object.is
  ): Promise<TerminalOperationOutcome> {
    return this.runExclusive(async (generation) => {
      const inactive = this.inactiveLeaseDiagnostic(lease);
      if (inactive !== undefined) return terminalOperationRejected(inactive);
      const change = { kind, state: nextState } as TerminalStateChange;
      const cancellation = cancelledOperationDiagnostic(lease, context);
      if (cancellation !== undefined) return terminalOperationRejected(cancellation);
      if (change.kind === 'bidiMode') {
        const presentation = this.cellPresentationPreflight(lease, change);
        if (presentation !== undefined) return presentation;
      }
      const fixedMode = modeTransitionDiagnostic(lease, change, this.#modeReports, this.#modeConflicts);
      if (fixedMode !== undefined) return terminalOperationRejected(fixedMode);
      if (kind !== 'bidiMode' && equal(this.#current[kind], nextState) && !this.#uncertain.has(kind)) {
        return terminalOperationApplied(change, assuranceForKnowledge(this.#current.provenance[kind]));
      }
      const unavailable = unavailableCapabilityOutcome(lease, capabilityForState(kind));
      if (unavailable !== undefined) return unavailable;
      const wasUncertain = this.#uncertain.has(kind);
      this.#uncertain.add(kind);
      try {
        await apply(context);
      } catch (cause) {
        if (!this.isCurrentGeneration(generation)) {
          return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
        }
        if (cause instanceof TerminalWriteError && cause.receipt.status === 'failed_before_write') {
          if (!wasUncertain) this.#uncertain.delete(kind);
          return terminalOperationRejected(cause.receipt.diagnostic);
        }
        this.markIndeterminate(kind);
        return terminalOperationIndeterminate(change, indeterminateOperationDiagnostic(lease, change, cause));
      }
      if (!this.isCurrentGeneration(generation)) {
        return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
      }
      if (kind === 'rawInput' && this.#rawInputKnowledge === 'observed') {
        const observed = this.#host.stdin.isRawModeEnabled?.();
        if (observed !== undefined && !Object.is(observed, nextState)) {
          this.setKnown('rawInput', observed, 'observed');
          return terminalOperationRejected(rawInputObservationMismatchDiagnostic(lease, observed));
        }
      }
      if (change.kind === 'bidiMode') {
        return this.confirmBidiModeChange(lease, change, context, generation);
      }
      const knowledge = knowledgeAfterMutation(kind, this.#rawInputKnowledge);
      this.setKnown(kind, nextState, knowledge);
      return terminalOperationApplied(change, knowledge === 'observed' ? 'observed' : 'sent');
    });
  }

  private cellPresentationPreflight(
    lease: TerminalSessionLease,
    change: Extract<TerminalStateChange, { readonly kind: 'bidiMode' }>,
  ): TerminalOperationOutcome | undefined {
    if (this.snapshot().cellPresentation === 'application-ordered') return terminalOperationApplied(change, 'declared');
    const report = this.#modeReports['standard:8'];
    const data = { operation: 'cellPresentation', mode: 'standard:8', report: report ?? null,
      bidiMode: this.#current.bidiMode, restorationBaseline: lease.initialState.bidiMode,
      qualification: this.#cellPresentation?.qualification ?? null };
    const rejected = (code: 'HOST_CAPABILITY_UNAVAILABLE' | 'HOST_CELL_PRESENTATION_UNQUALIFIED' | 'HOST_CELL_PRESENTATION_CONTRADICTED',
      reason: string, message: string): TerminalOperationOutcome => terminalOperationRejected(diagnostic(code, message,
        { severity: 'warning', target: lease.id, data: { ...data, reason } }));
    if (this.#cellPresentationQualificationInvalidated) return rejected('HOST_CELL_PRESENTATION_CONTRADICTED',
      'qualification-contradicted', 'Implicit or conflicting bidirectional evidence contradicts the caller qualification of existing application-ordered physical cells.');
    if (this.#modeConflicts.has('standard:8')) return rejected('HOST_CAPABILITY_UNAVAILABLE',
      'mode-reports-conflicting', 'Conflicting standard-mode-8 reports cannot authorize the qualified reset path.');
    if (report === 'permanently_set') return rejected('HOST_CELL_PRESENTATION_CONTRADICTED',
      'bidi-mode-fixed-implicit', 'Terminal standard mode 8 is permanently implicit and cannot establish application-ordered physical cells.');
    if (!this.#current.rawInput) return rejected('HOST_CAPABILITY_UNAVAILABLE',
      'raw-input-inactive', 'Cell-presentation acquisition requires active raw input.');
    if (this.#cellPresentation === undefined) return rejected('HOST_CELL_PRESENTATION_UNQUALIFIED',
      'presentation-unqualified', 'Application-ordered physical cells are unqualified: standard mode 8 does not establish left-to-right character path, cursor, pointer or arrow semantics.');
    if (report === undefined || report === 'unrecognized') return rejected('HOST_CAPABILITY_UNAVAILABLE',
      report === undefined ? 'bidi-mode-unreported' : 'bidi-mode-unrecognized',
      'The qualified mode-8-reset path requires an observed bidirectional mode and cannot acquire or restore an unreported mode.');
    if (lease.initialState.bidiMode === 'unknown') return rejected('HOST_CAPABILITY_UNAVAILABLE',
      'restoration-baseline-unknown', 'Bidirectional-mode acquisition has no known restoration baseline.');
    if (this.#observeBidiMode === undefined) return rejected('HOST_CAPABILITY_UNAVAILABLE',
      'verification-unavailable', 'Bidirectional-mode acquisition has no response observer.');
    if (modeIsMutable(report) !== true) return rejected('HOST_CAPABILITY_UNAVAILABLE',
      'bidi-mode-immutable', 'The observed bidirectional mode cannot be changed.');
    return undefined;
  }

  private async confirmBidiModeChange(
    lease: TerminalSessionLease,
    change: Extract<TerminalStateChange, { readonly kind: 'bidiMode' }>,
    context: TerminalOperationContext,
    generation: number,
  ): Promise<TerminalOperationOutcome> {
    const report = await this.observeBidiMode(context);
    if (!this.isCurrentGeneration(generation)) return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
    const implicit = modeIsSet(report);
    const observed = implicit === undefined ? undefined : implicit ? 'implicit' : 'explicit';
    if (report !== undefined) this.#modeReports = Object.freeze({ ...this.#modeReports, 'standard:8': report });
    if (observed === undefined) {
      this.markIndeterminate('bidiMode');
      return terminalOperationIndeterminate(change, diagnostic('HOST_OUTPUT_INDETERMINATE',
        'Terminal did not verify standard mode 8 after the write.', { severity: 'error', target: lease.id,
          data: { operation: 'cellPresentation', reason: 'verification-missing', mode: 'standard:8', report: report ?? null, expected: change.state } }));
    }
    this.setKnown('bidiMode', observed, 'observed');
    if (observed !== change.state) return terminalOperationRejected(diagnostic('HOST_PROTOCOL_UNSUPPORTED',
      'Terminal did not establish the qualified explicit bidirectional mode.', { severity: 'warning', target: lease.id,
        data: { operation: 'cellPresentation', reason: 'verification-mismatch', mode: 'standard:8', report: report ?? null, expected: change.state, observed } }));
    return terminalOperationApplied(change, 'observed');
  }

  async setKeyboardProfile(
    lease: TerminalSessionLease,
    profile: TerminalKeyboardProfile,
    context: TerminalOperationContext = {}
  ): Promise<TerminalOperationOutcome> {
    return this.runExclusive(async (generation) => {
      const inactive = this.inactiveLeaseDiagnostic(lease);
      if (inactive !== undefined) return terminalOperationRejected(inactive);
      const normalized = decodeKeyboardProfile(profile);
      const change = { kind: 'keyboardProfile', state: normalized } as const;
      const screen = this.activeScreen();
      const frameState = lease.keyboardFrameState(screen);
      const cancellation = cancelledOperationDiagnostic(lease, context);
      if (cancellation !== undefined) return terminalOperationRejected(cancellation);
      if (
        frameState === 'owned'
        &&
        keyboardProfilesEqual(this.#current.keyboardProfile, normalized)
        && !this.#uncertain.has('keyboardProfile')
        && this.#current.provenance.keyboardProfile !== 'assumed'
      ) {
        return terminalOperationApplied(
          change,
          assuranceForKnowledge(this.#current.provenance.keyboardProfile)
        );
      }
      const previousState = this.#keyboardByScreen[screen];
      const previousProfile = previousState.profile;
      this.#uncertain.add('keyboardProfile');
      let assurance: 'observed' | 'sent' = 'sent';
      let terminalMayHaveChanged = false;
      try {
        if (frameState === 'none') {
          lease.beginKeyboardFramePush(screen, previousState);
          await this.protocol(context).pushKeyboardProfile(normalized);
          terminalMayHaveChanged = true;
          lease.confirmKeyboardFramePush(screen);
        } else if (frameState === 'owned') {
          await this.protocol(context).setKeyboardProfile(normalized);
          terminalMayHaveChanged = true;
        } else {
          throw new Error(`Keyboard frame state is indeterminate on the ${screen} screen: ${frameState}.`);
        }
        if (normalized.kind === 'kitty' && this.#verifyKeyboardProfile !== undefined) {
          const verification = await this.#verifyKeyboardProfile(normalized.flags, context);
          if (verification !== 'verified') {
            if (!this.isCurrentGeneration(generation)) {
              return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
            }
            try {
              await this.protocol(context).setKeyboardProfile(previousProfile);
            } catch (cause) {
              this.markIndeterminate('keyboardProfile');
              return terminalOperationIndeterminate(
                change,
                indeterminateOperationDiagnostic(lease, change, cause)
              );
            }
            if (!this.isCurrentGeneration(generation)) {
              return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
            }
            this.setKnown('keyboardProfile', previousProfile, 'library_known');
            return terminalOperationRejected(diagnostic(
              verification === 'unsupported' ? 'HOST_PROTOCOL_UNSUPPORTED' : 'HOST_CAPABILITY_UNAVAILABLE',
              verification === 'unsupported'
                ? 'The terminal rejected the requested Kitty keyboard profile.'
                : 'The terminal did not verify the requested Kitty keyboard flags.',
              {
                severity: 'warning',
                target: lease.id,
                data: { requestedFlags: normalized.flags, verification }
              }
            ));
          }
          assurance = 'observed';
        }
      } catch (cause) {
        if (!this.isCurrentGeneration(generation)) {
          return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
        }
        if (
          !terminalMayHaveChanged
          && cause instanceof TerminalWriteError
          && cause.receipt.status === 'failed_before_write'
        ) {
          this.#uncertain.delete('keyboardProfile');
          lease.cancelKeyboardFramePush(screen);
          this.setKeyboardScreenState(screen, previousState);
          return terminalOperationRejected(cause.receipt.diagnostic);
        }
        this.markIndeterminate('keyboardProfile');
        return terminalOperationIndeterminate(change, indeterminateOperationDiagnostic(lease, change, cause));
      }
      if (!this.isCurrentGeneration(generation)) {
        return terminalOperationIndeterminate(change, supersededOperationDiagnostic(lease, change));
      }
      this.setKnown(
        'keyboardProfile',
        normalized,
        assurance === 'observed' ? 'observed' : 'library_known'
      );
      return terminalOperationApplied(change, assurance);
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
      return freezeRestoreResult({
        status: 'restored', reason, requested: snapshot, attempted: [], completed: [], resultingState: snapshot, diagnostics: []
      });
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
      return freezeRestoreResult({
        status: 'restored',
        reason,
        requested: snapshot,
        attempted: [],
        completed: [],
        resultingState: snapshot,
        diagnostics: []
      });
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
    const completed: TerminalRestoreCompletion[] = [];
    const diagnostics: TerminalDiagnostic[] = [];
    for (const operation of createTerminalRestorePlan(lease.initialState).operations) {
      const interruption = this.restoreInterruption(lease, operation, context, generation);
      if (interruption !== undefined) {
        diagnostics.push(interruption);
        break;
      }
      if (!this.shouldRestoreOperation(lease, operation)) continue;
      attempted.push(operation);
      const outcome = await this.restoreOperation(lease, operation, context, generation);
      if (outcome.completion !== undefined) completed.push(outcome.completion);
      if (outcome.diagnostic !== undefined) diagnostics.push(outcome.diagnostic);
      if (!outcome.continue) break;
    }
    const resultingState = this.snapshot();
    const status = diagnostics.length === 0 ? 'restored' : completed.length === 0 ? 'failed' : 'partial';
    const result: TerminalRestoreResult = {
      status,
      reason,
      requested: lease.initialState,
      attempted,
      completed,
      resultingState,
      diagnostics
    };
    if (status === 'restored') {
      this.removeActiveLease(lease);
      lease.completeRestore(result);
    }
    return this.recordRestore(result);
  }

  private restoreInterruption(
    lease: TerminalSessionLease,
    operation: TerminalRestorableStateChange,
    context: TerminalOperationContext,
    generation: number,
  ): TerminalDiagnostic | undefined {
    if (!this.isCurrentGeneration(generation)) return supersededRestoreDiagnostic(lease);
    return restoreWasCancelled(context)
      ? restoreCancellationDiagnostic(lease, context.signal, operation.kind)
      : undefined;
  }

  private shouldRestoreOperation(lease: TerminalSessionLease, operation: TerminalRestorableStateChange): boolean {
    if (operation.kind === 'bidiMode' && operation.state === 'unknown') return false;
    if (operation.kind === 'keyboardProfile') {
      return lease.keyboardFrameState(this.activeScreen()) !== 'none';
    }
    const stateMatches = operation.kind === 'mouseReporting'
      ? sameMouseReportingState(this.#current.mouseReporting, operation.state)
      : Object.is(this.#current[operation.kind], operation.state);
    return !stateMatches || this.#uncertain.has(operation.kind);
  }

  private async restoreOperation(
    lease: TerminalSessionLease,
    operation: TerminalRestorableStateChange,
    context: TerminalOperationContext,
    generation: number,
  ): Promise<RestoreOperationOutcome> {
    try {
      const restoredKeyboard = operation.kind === 'keyboardProfile'
        ? await lease.restoreKeyboardFrame(this.activeScreen(), this.recoveryProtocol(context))
        : undefined;
      if (operation.kind === 'bidiMode' && !this.#current.rawInput) {
        this.#uncertain.add('rawInput');
        await this.#host.stdin.setRawMode?.(true);
        if (!this.isCurrentGeneration(generation)) return { continue: false, diagnostic: supersededRestoreDiagnostic(lease, 'rawInput') };
        const raw = this.#host.stdin.isRawModeEnabled?.();
        if (raw === false) {
          this.setKnown('rawInput', false, this.#rawInputKnowledge);
          throw new Error('Raw input could not be reestablished for presentation restoration.');
        }
        this.setKnown('rawInput', true, knowledgeAfterMutation('rawInput', this.#rawInputKnowledge));
      }
      if (operation.kind !== 'keyboardProfile') await this.applyRestoreOperation(operation, context);
      if (!this.isCurrentGeneration(generation)) {
        return { continue: false, diagnostic: supersededRestoreDiagnostic(lease, operation.kind) };
      }
      if (operation.kind === 'bidiMode') {
        const report = await this.observeBidiMode(context, true);
        if (!this.isCurrentGeneration(generation)) return { continue: false, diagnostic: supersededRestoreDiagnostic(lease, operation.kind) };
        const implicit = modeIsSet(report);
        const observed = implicit === undefined ? undefined : implicit ? 'implicit' : 'explicit';
        if (report !== undefined) this.#modeReports = Object.freeze({ ...this.#modeReports, 'standard:8': report });
        if (observed !== operation.state) throw new Error('Terminal did not verify the restored standard mode 8 state.');
        this.setKnown('bidiMode', observed, 'observed');
        const cancellation = restoreWasCancelled(context) ? restoreCancellationDiagnostic(lease, context.signal, operation.kind) : undefined;
        return { continue: cancellation === undefined, completion: Object.freeze({ ...operation, assurance: 'observed' }),
          ...(cancellation === undefined ? {} : { diagnostic: cancellation }) };
      }
      const observationIssue = this.restoreObservationIssue(lease, operation);
      if (observationIssue !== undefined) return { continue: true, diagnostic: observationIssue };
      const completion = this.acceptRestoredOperation(operation, restoredKeyboard);
      const cancellation = restoreWasCancelled(context)
        ? restoreCancellationDiagnostic(lease, context.signal, operation.kind)
        : undefined;
      return { continue: cancellation === undefined, completion, ...(cancellation === undefined ? {} : {
        diagnostic: cancellation,
      }) };
    } catch (cause) {
      return this.restoreOperationFailure(lease, operation, context, generation, cause);
    }
  }

  private restoreObservationIssue(
    lease: TerminalSessionLease,
    operation: TerminalRestorableStateChange,
  ): TerminalDiagnostic | undefined {
    if (operation.kind !== 'rawInput' || this.#rawInputKnowledge !== 'observed') return undefined;
    const observed = this.#host.stdin.isRawModeEnabled?.();
    if (observed === undefined || observed === operation.state) return undefined;
    this.setKnown('rawInput', observed, 'observed');
    return rawInputObservationMismatchDiagnostic(lease, observed);
  }

  private acceptRestoredOperation(
    operation: TerminalRestorableStateChange,
    restoredKeyboard: RestoredKeyboardFrame | undefined,
  ): TerminalRestoreCompletion {
    if (operation.kind === 'keyboardProfile') {
      if (restoredKeyboard === undefined) {
        throw new Error('The active screen did not own a keyboard frame to restore.');
      }
      this.setKeyboardScreenState(restoredKeyboard.screen, restoredKeyboard.previous);
      return Object.freeze({
        kind: 'keyboardProfile',
        state: restoredKeyboard.previous.profile,
        assurance: 'sent',
      });
    }
    this.setKnown(operation.kind, operation.state, knowledgeAfterMutation(operation.kind, this.#rawInputKnowledge));
    return Object.freeze({
      ...operation,
      assurance: operation.kind === 'rawInput' && this.#rawInputKnowledge === 'observed' ? 'observed' : 'sent',
    });
  }

  private restoreOperationFailure(
    lease: TerminalSessionLease,
    operation: TerminalRestorableStateChange,
    context: TerminalOperationContext,
    generation: number,
    cause: unknown,
  ): RestoreOperationOutcome {
    if (!this.isCurrentGeneration(generation)) {
      return { continue: false, diagnostic: supersededRestoreDiagnostic(lease, operation.kind, cause) };
    }
    this.markIndeterminate(operation.kind);
    if (restoreWasCancelled(context)) {
      return {
        continue: false,
        diagnostic: restoreCancellationDiagnostic(lease, context.signal, operation.kind, cause),
      };
    }
    return {
      continue: true,
      diagnostic: diagnostic('HOST_RESTORE_FAILED', `Failed to restore terminal state: ${operation.kind}.`, {
        severity: 'error',
        target: lease.id,
        cause,
        data: { operation: operation.kind },
      }),
    };
  }

  private async applyRestoreOperation(
    operation: Exclude<TerminalRestorableStateChange, { readonly kind: 'keyboardProfile' }>,
    context: TerminalOperationContext
  ): Promise<void> {
    const protocol = this.recoveryProtocol(context);
    switch (operation.kind) {
      case 'cursorVisible':
        await (operation.state ? protocol.showCursor() : protocol.hideCursor());
        break;
      case 'focusReporting':
        await (operation.state ? protocol.enableFocusReporting() : protocol.disableFocusReporting());
        break;
      case 'metaSendsEscape':
        await (operation.state ? protocol.enableMetaSendsEscape() : protocol.disableMetaSendsEscape());
        break;
      case 'bidiMode':
        if (operation.state !== 'unknown') await protocol.setBidiMode(operation.state);
        break;
      case 'unicodeGraphemeMode':
        await (operation.state ? protocol.enableUnicodeGraphemeMode() : protocol.disableUnicodeGraphemeMode());
        break;
      case 'mouseReporting':
        await protocol.setMouseReporting(operation.state);
        break;
      case 'bracketedPaste':
        await (operation.state ? protocol.enableBracketedPaste() : protocol.disableBracketedPaste());
        break;
      case 'alternateScreen':
        await (operation.state ? protocol.enableAlternateScreen() : protocol.disableAlternateScreen());
        break;
      case 'rawInput':
        await this.#host.stdin.setRawMode?.(operation.state);
        break;
    }
  }

  private setKnown<K extends TerminalStateKey>(
    kind: K,
    value: TerminalStateStorage[K],
    knowledge: TerminalStateKnowledge
  ): void {
    if (kind === 'keyboardProfile') {
      this.setKeyboardScreenState(
        this.activeScreen(),
        keyboardScreenState(value as TerminalKeyboardProfile, knowledge)
      );
      return;
    }
    this.#current = freezeTerminalState({
      ...this.#current,
      [kind]: value,
      provenance: { ...this.#current.provenance, [kind]: knowledge }
    });
    this.#uncertain.delete(kind);
    if (kind === 'alternateScreen') this.syncActiveKeyboardState();
  }

  private async observeBidiMode(context: TerminalOperationContext, recovery = false): Promise<TerminalModeReportState | undefined> {
    try {
      return await this.#observeBidiMode?.(context, recovery);
    } catch {
      // Missing, aborted and malformed reports never establish a presentation state.
      return undefined;
    }
  }

  private observeBooleanMode(
    kind: Extract<TerminalStateKey, 'alternateScreen' | 'bracketedPaste' | 'cursorVisible' | 'focusReporting' | 'metaSendsEscape' | 'unicodeGraphemeMode'>,
    report: TerminalModeReportState | undefined
  ): void {
    const enabled = modeIsSet(report);
    if (enabled !== undefined && this.#current.provenance[kind] !== 'explicit') {
      this.setKnown(kind, enabled, 'observed');
    }
  }

  private observeMouseModes(reports: TerminalModeReports): void {
    if (this.#current.provenance.mouseReporting === 'explicit') return;
    const all = modeIsSet(reports['private:1003']);
    const drag = modeIsSet(reports['private:1002']);
    const click = modeIsSet(reports['private:1000']);
    const encoding = modeIsSet(reports['private:1006']);
    const tracking = all === true
      ? 'all'
      : drag === true
        ? 'drag'
        : click === true
          ? 'click'
          : all === false && drag === false && click === false
            ? 'none'
            : undefined;
    if (tracking === undefined || encoding === undefined) return;
    this.setKnown('mouseReporting', {
      tracking,
      encoding: encoding ? 'sgr' : 'default'
    }, 'observed');
  }

  private resetObservedModes(): void {
    const modeKinds = [
      'alternateScreen',
      'bracketedPaste',
      'mouseReporting',
      'focusReporting',
      'metaSendsEscape',
      'unicodeGraphemeMode',
      'bidiMode',
      'cursorVisible'
    ] as const;
    for (const kind of modeKinds) {
      if (this.#current.provenance[kind] === 'explicit') continue;
      this.setKnown(kind, this.#initial[kind], this.#initial.provenance[kind]);
    }
  }


  private markConflictedModes(): void {
    for (const kind of Object.keys(this.#current) as (TerminalStateKey | 'provenance')[]) {
      if (kind === 'provenance') continue;
      const change = { kind, state: this.#current[kind] } as TerminalRestorableStateChange;
      if (requestedTerminalModes(change).some(([mode]) => this.#modeConflicts.has(mode))) {
        // Conflicting observation is not evidence that this owner mutated the terminal.
        this.setKnown(kind, this.#current[kind], 'indeterminate');
      }
    }
  }

  private resetObservedState(): void {
    this.resetObservedModes();
    this.markConflictedModes();
    this.#keyboardByScreen.main = this.#initialKeyboardByScreen.main;
    this.#keyboardByScreen.alternate = this.#initialKeyboardByScreen.alternate;
    this.syncActiveKeyboardState();
  }

  private markIndeterminate(kind: TerminalStateKey): void {
    if (kind === 'keyboardProfile') {
      const screen = this.activeScreen();
      this.setKeyboardScreenState(screen, {
        ...this.#keyboardByScreen[screen],
        knowledge: 'indeterminate',
        uncertain: true
      });
      return;
    }
    this.#uncertain.add(kind);
    this.#current = freezeTerminalState({
      ...this.#current,
      provenance: { ...this.#current.provenance, [kind]: 'indeterminate' }
    });
  }

  private activeScreen(): TerminalScreen {
    return terminalScreen(this.#current.alternateScreen);
  }

  private setKeyboardScreenState(screen: TerminalScreen, state: KeyboardScreenState): void {
    this.#keyboardByScreen[screen] = keyboardScreenState(
      state.profile,
      state.knowledge,
      state.uncertain
    );
    if (screen === this.activeScreen()) this.syncActiveKeyboardState();
  }

  private syncActiveKeyboardState(): void {
    const keyboard = this.#keyboardByScreen[this.activeScreen()];
    this.#current = freezeTerminalState({
      ...this.#current,
      keyboardProfile: keyboard.profile,
      provenance: {
        ...this.#current.provenance,
        keyboardProfile: keyboard.knowledge
      }
    });
    if (keyboard.uncertain) this.#uncertain.add('keyboardProfile');
    else this.#uncertain.delete('keyboardProfile');
  }

  private inactiveLeaseDiagnostic(lease: TerminalSessionLease): TerminalDiagnostic | undefined {
    if (this.isActive(lease)) return undefined;
    return diagnostic('HOST_PROTOCOL_LEASE_INACTIVE', 'Terminal session is not the active host lease.', {
      severity: 'error',
      target: lease.id
    });
  }

  private recordRestore(result: TerminalRestoreResult): TerminalRestoreResult {
    const immutable = freezeRestoreResult(result);
    try {
      this.#host.observer?.recordRestore?.(immutable);
    } catch {
      // Observers cannot participate in terminal-state ownership.
    }
    return immutable;
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

export class TerminalSessionLease implements TerminalSession {
  readonly id: string;
  readonly host: TerminalHost;
  readonly capabilities: TerminalCapabilityProfile;
  readonly initialState: TerminalStateSnapshot;
  readonly #authority: TerminalStateAuthority;
  #completedRestore: Promise<TerminalRestoreResult> | undefined;
  #restoreAttempt: RestoreAttempt | undefined;
  readonly #keyboardFrames = new Map<TerminalScreen, KeyboardFrame>();

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

  currentState(): Promise<TerminalStateSnapshot> {
    return this.#authority.currentState(this);
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
    const state = Object.freeze({ tracking: mode, encoding: 'sgr' as const });
    return this.mutate(
      'mouseReporting',
      state,
      (operationContext) => this.protocol(operationContext).setMouseReporting(state),
      context,
      sameMouseReportingState
    );
  }

  enableFocusReporting(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('focusReporting', true, (operationContext) =>
      this.protocol(operationContext).enableFocusReporting(), context);
  }

  async enableCellPresentation(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    const outcome = await this.mutate('bidiMode', 'explicit', (operationContext) =>
      this.protocol(operationContext).setBidiMode('explicit'), context);
    const change = { kind: 'cellPresentation', state: 'application-ordered' } as const;
    if (outcome.status === 'applied') return { ...outcome, change, assurance: 'declared' };
    if (outcome.status === 'indeterminate') return { ...outcome, attempted: change };
    return outcome;
  }

  enableUnicodeGraphemeMode(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('unicodeGraphemeMode', true, (operationContext) =>
      this.protocol(operationContext).enableUnicodeGraphemeMode(), context);
  }

  enableMetaSendsEscape(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('metaSendsEscape', true, (operationContext) =>
      this.protocol(operationContext).enableMetaSendsEscape(), context);
  }

  async enableKeyboardProfile(
    profile: TerminalKeyboardProfile,
    context: TerminalOperationContext = {}
  ): Promise<TerminalOperationOutcome> {
    const support = this.requireCapability('keyboardProtocol');
    if (support !== undefined && profile.kind !== 'legacy') return support;
    return this.#authority.setKeyboardProfile(this, profile, context);
  }

  keyboardFrameState(screen: TerminalScreen): KeyboardFrameState {
    return this.#keyboardFrames.get(screen)?.state ?? 'none';
  }

  beginKeyboardFramePush(screen: TerminalScreen, previous: KeyboardScreenState): void {
    const state = this.keyboardFrameState(screen);
    if (state !== 'none') {
      throw new Error(`Cannot push a keyboard frame on the ${screen} screen from state ${state}.`);
    }
    this.#keyboardFrames.set(screen, { state: 'push_uncertain', previous });
  }

  confirmKeyboardFramePush(screen: TerminalScreen): void {
    const frame = this.#keyboardFrames.get(screen);
    if (frame?.state !== 'push_uncertain') {
      throw new Error(`Cannot confirm a keyboard frame on the ${screen} screen from state ${frame?.state ?? 'none'}.`);
    }
    this.#keyboardFrames.set(screen, { ...frame, state: 'owned' });
  }

  cancelKeyboardFramePush(screen: TerminalScreen): void {
    if (this.keyboardFrameState(screen) === 'push_uncertain') this.#keyboardFrames.delete(screen);
  }

  async restoreKeyboardFrame(
    screen: TerminalScreen,
    protocol: ReturnType<typeof createProtocolWriter>
  ): Promise<{ readonly screen: TerminalScreen; readonly previous: KeyboardScreenState } | undefined> {
    const frame = this.#keyboardFrames.get(screen);
    if (frame === undefined) return undefined;
    if (frame.state === 'pop_uncertain') {
      throw new Error(`Keyboard frame pop on the ${screen} screen has an indeterminate outcome and cannot be repeated safely.`);
    }
    this.#keyboardFrames.set(screen, { ...frame, state: 'pop_uncertain' });
    await protocol.popKeyboardProfile();
    this.#keyboardFrames.delete(screen);
    return { screen, previous: frame.previous };
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
    nextState: TerminalStateStorage[K],
    apply: (context: TerminalOperationContext) => void | Promise<void>,
    context: TerminalOperationContext,
    equal: (current: TerminalStateStorage[K], next: TerminalStateStorage[K]) => boolean = Object.is
  ): Promise<TerminalOperationOutcome> {
    return this.#authority.mutate(this, kind, nextState, apply, context, equal);
  }

  private requireCapability(kind: TerminalCapabilityName): TerminalOperationOutcome | undefined {
    return unavailableCapabilityOutcome(this, kind);
  }

  private protocol(context: TerminalOperationContext): ReturnType<typeof createProtocolWriter> {
    return createProtocolWriter({
      write: async (sequence) => {
        requireCommittedTerminalWrite(await this.host.write({ text: sequence }, context));
      }
    });
  }
}
