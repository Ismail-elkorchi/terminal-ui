import { diagnostic } from '../diagnostics.ts';
import { createProtocolWriter, decodeMouseReportingState } from '../protocol/index.ts';
import {
  LEGACY_KEYBOARD_PROFILE,
  decodeKeyboardProfile
} from '../protocol/keyboard.ts';
import {
  terminalOperationApplied,
  terminalOperationIndeterminate,
  terminalOperationRejected
} from './operation-outcome.ts';
import { requireCommittedTerminalWrite, TerminalWriteError } from './write-receipt.ts';
import { createTerminalRestorePlan } from './session-restore.ts';
import { waitForTerminalOperation } from './operation.ts';
import { modeIsSet } from './terminal-mode-query.ts';
import type { TerminalModeReports, TerminalModeReportState } from './terminal-mode-query.ts';
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
  TerminalRestoreCompletion,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalStateChange,
  TerminalStateKnowledge,
  TerminalStateProvenanceSnapshot,
  TerminalStateSnapshot
} from './types.ts';

type TerminalStateKey = keyof Omit<TerminalStateSnapshot, 'provenance'>;
type TerminalScreen = 'main' | 'alternate';

interface KeyboardScreenState {
  readonly profile: TerminalKeyboardProfile;
  readonly knowledge: TerminalStateKnowledge;
  readonly uncertain: boolean;
}

interface KeyboardFrame {
  readonly state: KeyboardFrameState;
  readonly previous: KeyboardScreenState;
}

export interface TerminalStateAuthorityOptions {
  readonly rawInputKnowledge: TerminalStateKnowledge;
  readonly initialState?: TerminalInitialState;
  readonly verifyKeyboardProfile?: (
    flags: number,
    context: TerminalOperationContext
  ) => Promise<'verified' | 'unsupported' | 'inconclusive'>;
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

  observeModes(reports: TerminalModeReports): Promise<void> {
    return this.authority().observeModes(reports);
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
  readonly #rawInputKnowledge: TerminalStateKnowledge;
  readonly #verifyKeyboardProfile: TerminalStateAuthorityOptions['verifyKeyboardProfile'];
  readonly #leases: TerminalSessionLease[] = [];
  readonly #uncertain = new Set<TerminalStateKey>();
  readonly #initial: TerminalStateSnapshot;
  readonly #initialKeyboardByScreen: Readonly<Record<TerminalScreen, KeyboardScreenState>>;
  readonly #keyboardByScreen: Record<TerminalScreen, KeyboardScreenState>;
  #modeReports: TerminalModeReports = Object.freeze({});
  #current: TerminalStateSnapshot;
  #generation = 0;
  #tail: Promise<void> | undefined;

  constructor(host: TerminalHost, options: TerminalStateAuthorityOptions) {
    this.#host = host;
    this.#rawInputKnowledge = options.rawInputKnowledge;
    this.#verifyKeyboardProfile = options.verifyKeyboardProfile;
    this.#initial = initialTerminalState(host, options);
    this.#current = this.#initial;
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

  observeModes(reports: TerminalModeReports): Promise<void> {
    return this.runExclusive(() => {
      if (this.#leases.length > 0) {
        throw new Error('Terminal modes cannot be observed while a terminal session is active.');
      }
      this.resetObservedModes();
      this.#modeReports = Object.freeze({ ...reports });
      this.observeBooleanMode('cursorVisible', reports[25]);
      this.observeBooleanMode('focusReporting', reports[1004]);
      this.observeBooleanMode('alternateScreen', reports[1049]);
      this.observeBooleanMode('bracketedPaste', reports[2004]);
      this.observeBooleanMode('unicodeGraphemeMode', reports[2027]);
      this.observeMouseModes(reports);
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
    return cloneTerminalState(this.#current, this.#uncertain);
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
    nextState: TerminalStateSnapshot[K],
    apply: (context: TerminalOperationContext) => void | Promise<void>,
    context: TerminalOperationContext = {},
    equal: (current: TerminalStateSnapshot[K], next: TerminalStateSnapshot[K]) => boolean = Object.is
  ): Promise<TerminalOperationOutcome> {
    return this.runExclusive(async (generation) => {
      const inactive = this.inactiveLeaseDiagnostic(lease);
      if (inactive !== undefined) return terminalOperationRejected(inactive);
      const change = { kind, state: nextState } as TerminalStateChange;
      const cancellation = cancelledOperationDiagnostic(lease, context);
      if (cancellation !== undefined) return terminalOperationRejected(cancellation);
      if (equal(this.#current[kind], nextState) && !this.#uncertain.has(kind)) {
        return terminalOperationApplied(change, assuranceForKnowledge(this.#current.provenance[kind]));
      }
      const fixedMode = permanentModeTransitionDiagnostic(lease, change, this.#modeReports);
      if (fixedMode !== undefined) return terminalOperationRejected(fixedMode);
      const unavailable = unavailableCapabilityOutcome(lease, capabilityForState(kind));
      if (unavailable !== undefined) return unavailable;
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
      if (kind === 'rawInput' && this.#rawInputKnowledge === 'observed') {
        const observed = this.#host.stdin.isRawModeEnabled?.();
        if (observed !== undefined && !Object.is(observed, nextState)) {
          this.setKnown('rawInput', observed, 'observed');
          return terminalOperationRejected(rawInputObservationMismatchDiagnostic(lease, observed));
        }
      }
      const knowledge = knowledgeAfterMutation(kind, this.#rawInputKnowledge);
      this.setKnown(kind, nextState, knowledge);
      return terminalOperationApplied(change, knowledge === 'observed' ? 'observed' : 'sent');
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
      if (!this.isCurrentGeneration(generation)) {
        diagnostics.push(supersededRestoreDiagnostic(lease));
        break;
      }
      if (restoreWasCancelled(context)) {
        diagnostics.push(restoreCancellationDiagnostic(lease, context.signal, operation.kind));
        break;
      }
      const stateMatches = operation.kind === 'mouseReporting'
        ? sameMouseReportingState(this.#current.mouseReporting, operation.state)
        : Object.is(this.#current[operation.kind], operation.state);
      const hasKeyboardFrame = operation.kind === 'keyboardProfile'
        && lease.keyboardFrameState(this.activeScreen()) !== 'none';
      if (operation.kind === 'keyboardProfile' && !hasKeyboardFrame) continue;
      if (operation.kind !== 'keyboardProfile' && stateMatches && !this.#uncertain.has(operation.kind)) continue;
      attempted.push(operation);
      try {
        const restoredKeyboard = operation.kind === 'keyboardProfile'
          ? await lease.restoreKeyboardFrame(this.activeScreen(), this.recoveryProtocol(context))
          : undefined;
        if (operation.kind !== 'keyboardProfile') {
          await this.applyRestoreOperation(operation, context);
        }
        if (!this.isCurrentGeneration(generation)) {
          diagnostics.push(supersededRestoreDiagnostic(lease, operation.kind));
          break;
        }
        if (operation.kind === 'rawInput' && this.#rawInputKnowledge === 'observed') {
          const observed = this.#host.stdin.isRawModeEnabled?.();
          if (observed !== undefined && observed !== operation.state) {
            this.setKnown('rawInput', observed, 'observed');
            diagnostics.push(rawInputObservationMismatchDiagnostic(lease, observed));
            continue;
          }
        }
        if (operation.kind === 'keyboardProfile') {
          if (restoredKeyboard === undefined) {
            throw new Error('The active screen did not own a keyboard frame to restore.');
          }
          this.setKeyboardScreenState(restoredKeyboard.screen, restoredKeyboard.previous);
        } else {
          this.setKnown(
            operation.kind,
            operation.state,
            knowledgeAfterMutation(operation.kind, this.#rawInputKnowledge)
          );
        }
        completed.push(Object.freeze({
          ...(operation.kind === 'keyboardProfile' && restoredKeyboard !== undefined
            ? { kind: 'keyboardProfile' as const, state: restoredKeyboard.previous.profile }
            : operation),
          assurance: operation.kind === 'rawInput' && this.#rawInputKnowledge === 'observed'
            ? 'observed'
            : 'sent'
        }));
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

  private async applyRestoreOperation(
    operation: Exclude<TerminalStateChange, { readonly kind: 'keyboardProfile' }>,
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
    value: TerminalStateSnapshot[K],
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

  private observeBooleanMode(
    kind: Extract<TerminalStateKey, 'alternateScreen' | 'bracketedPaste' | 'cursorVisible' | 'focusReporting' | 'unicodeGraphemeMode'>,
    report: TerminalModeReportState | undefined
  ): void {
    const enabled = modeIsSet(report);
    if (enabled !== undefined && this.#current.provenance[kind] !== 'explicit') {
      this.setKnown(kind, enabled, 'observed');
    }
  }

  private observeMouseModes(reports: TerminalModeReports): void {
    if (this.#current.provenance.mouseReporting === 'explicit') return;
    const all = modeIsSet(reports[1003]);
    const drag = modeIsSet(reports[1002]);
    const click = modeIsSet(reports[1000]);
    const encoding = modeIsSet(reports[1006]);
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
      'unicodeGraphemeMode',
      'cursorVisible'
    ] as const;
    for (const kind of modeKinds) {
      if (this.#current.provenance[kind] === 'explicit') continue;
      this.setKnown(kind, this.#initial[kind], this.#initial.provenance[kind]);
    }
  }

  private resetObservedState(): void {
    this.resetObservedModes();
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

class TerminalSessionLease implements TerminalSession {
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

  enableUnicodeGraphemeMode(context: TerminalOperationContext = {}): Promise<TerminalOperationOutcome> {
    return this.mutate('unicodeGraphemeMode', true, (operationContext) =>
      this.protocol(operationContext).enableUnicodeGraphemeMode(), context);
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
    nextState: TerminalStateSnapshot[K],
    apply: (context: TerminalOperationContext) => void | Promise<void>,
    context: TerminalOperationContext,
    equal: (current: TerminalStateSnapshot[K], next: TerminalStateSnapshot[K]) => boolean = Object.is
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

interface RestoreAttempt {
  readonly promise: Promise<TerminalRestoreResult>;
}

type KeyboardFrameState = 'none' | 'push_uncertain' | 'owned' | 'pop_uncertain';

function terminalScreen(alternateScreen: boolean): TerminalScreen {
  return alternateScreen ? 'alternate' : 'main';
}

function otherTerminalScreen(screen: TerminalScreen): TerminalScreen {
  return screen === 'main' ? 'alternate' : 'main';
}

function keyboardScreenState(
  profile: TerminalKeyboardProfile,
  knowledge: TerminalStateKnowledge,
  uncertain = false
): KeyboardScreenState {
  return Object.freeze({
    profile: Object.isFrozen(profile) ? profile : Object.freeze({ ...profile }),
    knowledge,
    uncertain
  });
}

function initialTerminalState(
  host: TerminalHost,
  options: TerminalStateAuthorityOptions
): TerminalStateSnapshot {
  const explicit = normalizeInitialState(options.initialState);
  const rawInput = explicit.rawInput ?? host.stdin.isRawModeEnabled?.() ?? false;
  const values = {
    rawInput,
    alternateScreen: explicit.alternateScreen ?? false,
    bracketedPaste: explicit.bracketedPaste ?? false,
    mouseReporting: explicit.mouseReporting ?? Object.freeze({ tracking: 'none', encoding: 'default' }),
    focusReporting: explicit.focusReporting ?? false,
    unicodeGraphemeMode: explicit.unicodeGraphemeMode ?? false,
    keyboardProfile: explicit.keyboardProfile ?? LEGACY_KEYBOARD_PROFILE,
    cursorVisible: explicit.cursorVisible ?? true
  } satisfies Omit<TerminalStateSnapshot, 'provenance'>;
  const provenance: TerminalStateProvenanceSnapshot = {
    rawInput: Object.hasOwn(explicit, 'rawInput') ? 'explicit' : options.rawInputKnowledge,
    alternateScreen: initialKnowledge(explicit, 'alternateScreen'),
    bracketedPaste: initialKnowledge(explicit, 'bracketedPaste'),
    mouseReporting: initialKnowledge(explicit, 'mouseReporting'),
    focusReporting: initialKnowledge(explicit, 'focusReporting'),
    unicodeGraphemeMode: initialKnowledge(explicit, 'unicodeGraphemeMode'),
    keyboardProfile: initialKnowledge(explicit, 'keyboardProfile'),
    cursorVisible: initialKnowledge(explicit, 'cursorVisible')
  };
  return freezeTerminalState({ ...values, provenance });
}

function initialKnowledge(
  state: TerminalInitialState,
  kind: Exclude<TerminalStateKey, 'rawInput'>
): TerminalStateKnowledge {
  return Object.hasOwn(state, kind) ? 'explicit' : 'assumed';
}

function normalizeInitialState(initial: unknown): TerminalInitialState {
  if (initial === undefined) return {};
  if (typeof initial !== 'object' || initial === null || Array.isArray(initial)) {
    throw new TypeError('Terminal initial state must be an object.');
  }
  const supplied = initial as Readonly<Record<string, unknown>>;
  const rawInput = optionalInitialBoolean(supplied['rawInput'], 'rawInput');
  const alternateScreen = optionalInitialBoolean(supplied['alternateScreen'], 'alternateScreen');
  const bracketedPaste = optionalInitialBoolean(supplied['bracketedPaste'], 'bracketedPaste');
  const focusReporting = optionalInitialBoolean(supplied['focusReporting'], 'focusReporting');
  const unicodeGraphemeMode = optionalInitialBoolean(
    supplied['unicodeGraphemeMode'],
    'unicodeGraphemeMode',
  );
  const cursorVisible = optionalInitialBoolean(supplied['cursorVisible'], 'cursorVisible');
  const mouseReporting = supplied['mouseReporting'];
  const keyboardProfile = supplied['keyboardProfile'];
  return Object.freeze({
    ...(rawInput === undefined ? {} : { rawInput }),
    ...(alternateScreen === undefined ? {} : { alternateScreen }),
    ...(bracketedPaste === undefined ? {} : { bracketedPaste }),
    ...(focusReporting === undefined ? {} : { focusReporting }),
    ...(unicodeGraphemeMode === undefined
      ? {}
      : { unicodeGraphemeMode }),
    ...(cursorVisible === undefined ? {} : { cursorVisible }),
    ...(mouseReporting === undefined
      ? {}
      : { mouseReporting: decodeMouseReportingState(mouseReporting) }),
    ...(keyboardProfile === undefined
      ? {}
      : { keyboardProfile: decodeKeyboardProfile(keyboardProfile) })
  });
}

function optionalInitialBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  throw new TypeError(`Terminal initial state ${field} must be a boolean.`);
}

function cloneTerminalState(
  state: TerminalStateSnapshot,
  uncertain: ReadonlySet<TerminalStateKey>
): TerminalStateSnapshot {
  const provenance = { ...state.provenance };
  for (const key of uncertain) provenance[key] = 'indeterminate';
  return freezeTerminalState({ ...state, provenance });
}

function freezeTerminalState(state: TerminalStateSnapshot): TerminalStateSnapshot {
  return Object.freeze({
    ...state,
    mouseReporting: Object.isFrozen(state.mouseReporting)
      ? state.mouseReporting
      : Object.freeze({ ...state.mouseReporting }),
    keyboardProfile: Object.isFrozen(state.keyboardProfile)
      ? state.keyboardProfile
      : Object.freeze({ ...state.keyboardProfile }),
    provenance: Object.freeze({ ...state.provenance })
  });
}

function knowledgeAfterMutation(
  kind: TerminalStateKey,
  rawInputKnowledge: TerminalStateKnowledge
): TerminalStateKnowledge {
  return kind === 'rawInput' && rawInputKnowledge === 'observed' ? 'observed' : 'library_known';
}

function unavailableCapabilityOutcome(
  lease: TerminalSessionLease,
  kind: TerminalCapabilityName
): TerminalOperationOutcome | undefined {
  const capability = lease.capabilities[kind];
  if (capability.support === 'supported' && capability.availability === 'available') return undefined;
  return terminalOperationRejected(diagnostic(
    'HOST_PROTOCOL_UNSUPPORTED',
    `Terminal protocol is unavailable: ${kind}.`,
    {
      severity: 'warning',
      target: lease.id,
      data: {
        capability: kind,
        support: capability.support,
        availability: capability.availability,
        diagnostics: capability.diagnostics.map((item) => item.message)
      }
    }
  ));
}

function permanentModeTransitionDiagnostic(
  lease: TerminalSessionLease,
  change: TerminalStateChange,
  reports: TerminalModeReports
): TerminalDiagnostic | undefined {
  const requestedModes = requestedPrivateModes(change);
  for (const [mode, requested] of requestedModes) {
    const fixed = permanentModeValue(reports[mode]);
    if (fixed === undefined || fixed === requested) continue;
    return diagnostic(
      'HOST_PROTOCOL_UNSUPPORTED',
      `Terminal mode ${String(mode)} is permanent and cannot reach the requested ${change.kind} state.`,
      {
        severity: 'warning',
        target: lease.id,
        data: { operation: change.kind, mode, fixed, requested }
      }
    );
  }
  return undefined;
}

function requestedPrivateModes(
  change: TerminalStateChange
): readonly (readonly [keyof TerminalModeReports, boolean])[] {
  switch (change.kind) {
    case 'alternateScreen': return [[1049, change.state]];
    case 'bracketedPaste': return [[2004, change.state]];
    case 'cursorVisible': return [[25, change.state]];
    case 'focusReporting': return [[1004, change.state]];
    case 'unicodeGraphemeMode': return [[2027, change.state]];
    case 'mouseReporting': {
      const mouse = change.state;
      return [
        [1000, mouse.tracking === 'click'],
        [1002, mouse.tracking === 'drag'],
        [1003, mouse.tracking === 'all'],
        [1006, mouse.encoding === 'sgr']
      ];
    }
    case 'rawInput':
    case 'keyboardProfile':
      return [];
  }
}

function permanentModeValue(report: TerminalModeReportState | undefined): boolean | undefined {
  if (report === 'permanently_set') return true;
  if (report === 'permanently_reset') return false;
  return undefined;
}

function assuranceForKnowledge(
  knowledge: TerminalStateKnowledge
): Extract<TerminalOperationOutcome, { readonly status: 'applied' }>['assurance'] {
  if (knowledge === 'observed') return 'observed';
  if (knowledge === 'library_known') return 'sent';
  return 'assumed';
}

function capabilityForState(kind: TerminalStateKey): TerminalCapabilityName {
  switch (kind) {
    case 'rawInput': return 'rawInput';
    case 'alternateScreen': return 'alternateScreen';
    case 'bracketedPaste': return 'bracketedPaste';
    case 'mouseReporting': return 'mouseReporting';
    case 'focusReporting': return 'focusReporting';
    case 'unicodeGraphemeMode': return 'unicodeGraphemeMode';
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

function rawInputObservationMismatchDiagnostic(
  lease: TerminalSessionLease,
  observed: boolean
): TerminalDiagnostic {
  return diagnostic(
    'HOST_PROTOCOL_UNSUPPORTED',
    'The terminal input adapter did not reach the requested raw-input state.',
    {
      severity: 'error',
      target: lease.id,
      data: { operation: 'rawInput', observed }
    }
  );
}

function keyboardProfilesEqual(left: TerminalKeyboardProfile, right: TerminalKeyboardProfile): boolean {
  return left.kind === right.kind
    && (left.kind === 'legacy' || (right.kind === 'kitty' && left.flags === right.flags));
}

function sameMouseReportingState(
  left: TerminalStateSnapshot['mouseReporting'],
  right: TerminalStateSnapshot['mouseReporting']
): boolean {
  return left.tracking === right.tracking && left.encoding === right.encoding;
}

function failedRestore(
  requested: TerminalStateSnapshot,
  reason: TerminalRestoreReason,
  resultingState: TerminalStateSnapshot,
  diagnostics: readonly TerminalDiagnostic[]
): TerminalRestoreResult {
  return { status: 'failed', reason, requested, attempted: [], completed: [], resultingState, diagnostics };
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
  const completed = results.flatMap((item) => item.completed);
  return freezeRestoreResult({
    status: diagnostics.length === 0 ? 'restored' : completed.length === 0 ? 'failed' : 'partial',
    reason,
    requested: last.requested,
    attempted: results.flatMap((item) => item.attempted),
    completed,
    resultingState: last.resultingState,
    diagnostics
  });
}

function freezeRestoreResult(result: TerminalRestoreResult): TerminalRestoreResult {
  return Object.freeze({
    ...result,
    attempted: Object.freeze(result.attempted.map(freezeTerminalStateChange)),
    completed: Object.freeze(result.completed.map((item) => Object.freeze({
      ...freezeTerminalStateChange(item),
      assurance: item.assurance
    }))),
    diagnostics: Object.freeze([...result.diagnostics])
  });
}

function freezeTerminalStateChange(change: TerminalStateChange): TerminalStateChange {
  return Object.freeze({ ...change });
}
