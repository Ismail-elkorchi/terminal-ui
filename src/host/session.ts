import { diagnostic } from '../diagnostics.ts';
import { createProtocolWriter, createRestorePlan } from '../protocol/index.ts';
import { err, ok } from '../result.ts';
import { registerTerminalSession, unregisterTerminalSession } from './session-registry.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { Result } from '../result.ts';
import type {
  MouseReportingMode,
  TerminalHost,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalStateChange,
  TerminalStateSnapshot
} from './types.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';

export class BasicTerminalSession implements TerminalSession {
  readonly startedAt: number;
  readonly initialState: TerminalStateSnapshot;
  #state: TerminalStateSnapshot;
  #changes: TerminalStateChange[] = [];
  #protocol: ReturnType<typeof createProtocolWriter>;

  constructor(
    readonly id: string,
    readonly host: TerminalHost,
    readonly capabilities: TerminalCapabilityProfile
  ) {
    this.startedAt = host.clock.now();
    this.initialState = {
      rawInput: host.stdin.isRawModeEnabled?.() ?? false,
      alternateScreen: false,
      bracketedPaste: false,
      mouseReporting: 'none',
      focusReporting: false,
      cursorVisible: true
    };
    this.#state = this.initialState;
    this.#protocol = createProtocolWriter(host);
    registerTerminalSession(this);
  }

  async enableRawInput(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('rawInput');
    if (support !== undefined) return support;
    await this.host.stdin.setRawMode?.(true);
    return this.#set('rawInput', true);
  }

  async enableAlternateScreen(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('alternateScreen');
    if (support !== undefined) return support;
    await this.#protocol.enableAlternateScreen();
    return this.#set('alternateScreen', true);
  }

  async enableBracketedPaste(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('bracketedPaste');
    if (support !== undefined) return support;
    await this.#protocol.enableBracketedPaste();
    return this.#set('bracketedPaste', true);
  }

  async enableMouseReporting(mode: MouseReportingMode = 'click'): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('mouseReporting');
    if (support !== undefined) return support;
    await this.#protocol.enableMouseReporting(mode);
    return this.#set('mouseReporting', mode);
  }

  async enableFocusReporting(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('focusReporting');
    if (support !== undefined) return support;
    await this.#protocol.enableFocusReporting();
    return this.#set('focusReporting', true);
  }

  async hideCursor(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('cursorVisibility');
    if (support !== undefined) return support;
    await this.#protocol.hideCursor();
    return this.#set('cursorVisible', false);
  }

  async showCursor(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('cursorVisibility');
    if (support !== undefined) return support;
    await this.#protocol.showCursor();
    return this.#set('cursorVisible', true);
  }

  async restore(reason: TerminalRestoreReason = 'success'): Promise<TerminalRestoreResult> {
    const restored: TerminalStateChange[] = [];
    const diagnostics: TerminalDiagnostic[] = [];
    const plan = createRestorePlan(this.initialState);
    for (const operation of plan.operations) {
      if (this.#state[operation.kind] === operation.enabled) continue;
      try {
        await this.#applyRestoreOperation(operation);
        this.#state = { ...this.#state, [operation.kind]: operation.enabled };
        restored.push(operation);
      } catch (cause) {
        diagnostics.push(diagnostic('HOST_RESTORE_FAILED', `Failed to restore terminal state: ${operation.kind}.`, {
          severity: 'error',
          target: this.id,
          cause,
          data: { operation: operation.kind }
        }));
      }
    }
    if (diagnostics.length === 0) {
      this.#state = this.initialState;
      this.#changes = [];
      unregisterTerminalSession(this);
    }
    const recorder = this.host as TerminalHost & {
      recordRestore?: (checkpoint: TerminalStateSnapshot) => void;
    };
    recorder.recordRestore?.(this.#state);
    return { ok: diagnostics.length === 0, reason, restored, diagnostics };
  }

  #set<K extends keyof TerminalStateSnapshot>(
    kind: K,
    enabled: TerminalStateSnapshot[K]
  ): Result<TerminalStateChange> {
    if (this.#state[kind] === enabled) {
      return ok({ kind, enabled } as TerminalStateChange);
    }
    this.#state = { ...this.#state, [kind]: enabled };
    const change = { kind, enabled } as TerminalStateChange;
    this.#changes.push(change);
    return ok(change);
  }

  #requireCapability(
    kind:
      | 'rawInput'
      | 'alternateScreen'
      | 'bracketedPaste'
      | 'mouseReporting'
      | 'focusReporting'
      | 'cursorVisibility'
  ): Result<never> | undefined {
    const capability = this.capabilities[kind];
    if (capability.status === 'supported') return undefined;
    return err(diagnostic(
      'HOST_PROTOCOL_UNSUPPORTED',
      `Terminal protocol is unavailable: ${kind}.`,
      {
        severity: 'warning',
        target: this.id,
        data: {
          capability: kind,
          confidence: capability.confidence,
          diagnostics: capability.diagnostics.map((item) => item.message)
        }
      }
    ));
  }

  async #applyRestoreOperation(operation: TerminalStateChange): Promise<void> {
    switch (operation.kind) {
      case 'cursorVisible':
        if (operation.enabled) await this.#protocol.showCursor();
        else await this.#protocol.hideCursor();
        break;
      case 'focusReporting':
        if (operation.enabled) await this.#protocol.enableFocusReporting();
        else await this.#protocol.disableFocusReporting();
        break;
      case 'mouseReporting':
        if (operation.enabled === 'none') await this.#protocol.disableMouseReporting();
        else await this.#protocol.enableMouseReporting(operation.enabled);
        break;
      case 'bracketedPaste':
        if (operation.enabled) await this.#protocol.enableBracketedPaste();
        else await this.#protocol.disableBracketedPaste();
        break;
      case 'alternateScreen':
        if (operation.enabled) await this.#protocol.enableAlternateScreen();
        else await this.#protocol.disableAlternateScreen();
        break;
      case 'rawInput':
        await this.host.stdin.setRawMode?.(operation.enabled);
        break;
    }
  }
}
