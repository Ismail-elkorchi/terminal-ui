import { diagnostic } from '../diagnostics.ts';
import { createProtocolWriter } from '../protocol/index.ts';
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
import { createTerminalRestorePlan } from './session-restore.ts';
import { LEGACY_KEYBOARD_PROFILE, normalizeKeyboardProfile } from '../protocol/keyboard.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';

export class BasicTerminalSession implements TerminalSession {
  readonly id: string;
  readonly host: TerminalHost;
  readonly capabilities: TerminalCapabilityProfile;
  readonly initialState: TerminalStateSnapshot;
  #state: TerminalStateSnapshot;
  #uncertain = new Set<keyof TerminalStateSnapshot>();
  #protocol: ReturnType<typeof createProtocolWriter>;
  #ownsKeyboardProfileStackFrame = false;

  constructor(
    id: string,
    host: TerminalHost,
    capabilities: TerminalCapabilityProfile
  ) {
    this.id = id;
    this.host = host;
    this.capabilities = capabilities;
    this.initialState = {
      rawInput: host.stdin.isRawModeEnabled?.() ?? false,
      alternateScreen: false,
      bracketedPaste: false,
      mouseReporting: 'none',
      focusReporting: false,
      keyboardProfile: LEGACY_KEYBOARD_PROFILE,
      cursorVisible: true
    };
    this.#state = this.initialState;
    this.#protocol = createProtocolWriter({
      write: async (sequence) => host.write({ text: sequence })
    });
    registerTerminalSession(this);
  }

  async enableRawInput(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('rawInput');
    if (support !== undefined) return support;
    return this.#mutate('rawInput', true, () => this.host.stdin.setRawMode?.(true));
  }

  async enableAlternateScreen(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('alternateScreen');
    if (support !== undefined) return support;
    return this.#mutate('alternateScreen', true, () => this.#protocol.enableAlternateScreen());
  }

  async enableBracketedPaste(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('bracketedPaste');
    if (support !== undefined) return support;
    return this.#mutate('bracketedPaste', true, () => this.#protocol.enableBracketedPaste());
  }

  async enableMouseReporting(mode: MouseReportingMode = 'click'): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('mouseReporting');
    if (support !== undefined) return support;
    return this.#mutate('mouseReporting', mode, () => this.#protocol.enableMouseReporting(mode));
  }

  async enableFocusReporting(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('focusReporting');
    if (support !== undefined) return support;
    return this.#mutate('focusReporting', true, () => this.#protocol.enableFocusReporting());
  }

  async enableKeyboardProfile(profile: TerminalKeyboardProfile): Promise<Result<TerminalStateChange>> {
    const normalized = normalizeKeyboardProfile(profile);
    if (
      keyboardProfilesEqual(this.#state.keyboardProfile, normalized)
      && !this.#uncertain.has('keyboardProfile')
    ) {
      return ok({ kind: 'keyboardProfile', enabled: normalized });
    }
    if (normalized.kind === 'legacy' && !this.#ownsKeyboardProfileStackFrame) {
      this.#state = { ...this.#state, keyboardProfile: normalized };
      this.#uncertain.delete('keyboardProfile');
      return ok({ kind: 'keyboardProfile', enabled: normalized });
    }
    const support = this.#requireCapability('keyboardProtocol');
    if (support !== undefined) return support;
    const change = { kind: 'keyboardProfile', enabled: normalized } as const;
    this.#uncertain.add('keyboardProfile');
    if (this.#ownsKeyboardProfileStackFrame) {
      await this.#protocol.setKeyboardProfile(normalized);
    } else {
      this.#ownsKeyboardProfileStackFrame = true;
      await this.#protocol.pushKeyboardProfile(normalized);
    }
    this.#state = { ...this.#state, keyboardProfile: normalized };
    this.#uncertain.delete('keyboardProfile');
    return ok(change);
  }

  async hideCursor(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('cursorVisibility');
    if (support !== undefined) return support;
    return this.#mutate('cursorVisible', false, () => this.#protocol.hideCursor());
  }

  async showCursor(): Promise<Result<TerminalStateChange>> {
    const support = this.#requireCapability('cursorVisibility');
    if (support !== undefined) return support;
    return this.#mutate('cursorVisible', true, () => this.#protocol.showCursor());
  }

  async restore(reason: TerminalRestoreReason = 'success'): Promise<TerminalRestoreResult> {
    const restored: TerminalStateChange[] = [];
    const diagnostics: TerminalDiagnostic[] = [];
    const plan = createTerminalRestorePlan(this.initialState);
    for (const operation of plan.operations) {
      const ownsKeyboardFrame = operation.kind === 'keyboardProfile' && this.#ownsKeyboardProfileStackFrame;
      const stateMatches = operation.kind === 'keyboardProfile'
        ? keyboardProfilesEqual(this.#state.keyboardProfile, operation.enabled)
        : Object.is(this.#state[operation.kind], operation.enabled);
      if (
        !ownsKeyboardFrame
        && stateMatches
        && !this.#uncertain.has(operation.kind)
      ) continue;
      try {
        await this.#applyRestoreOperation(operation);
        this.#state = { ...this.#state, [operation.kind]: operation.enabled };
        this.#uncertain.delete(operation.kind);
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
      this.#uncertain.clear();
      unregisterTerminalSession(this);
    }
    this.host.observer?.recordRestore?.(this.#state);
    return { ok: diagnostics.length === 0, reason, restored, diagnostics };
  }

  async #mutate<K extends keyof TerminalStateSnapshot>(
    kind: K,
    enabled: TerminalStateSnapshot[K],
    apply: () => void | Promise<void>,
    equal: (current: TerminalStateSnapshot[K], next: TerminalStateSnapshot[K]) => boolean = Object.is
  ): Promise<Result<TerminalStateChange>> {
    const change = { kind, enabled } as TerminalStateChange;
    if (equal(this.#state[kind], enabled) && !this.#uncertain.has(kind)) return ok(change);
    this.#uncertain.add(kind);
    await apply();
    this.#state = { ...this.#state, [kind]: enabled };
    this.#uncertain.delete(kind);
    return ok(change);
  }

  #requireCapability(
    kind:
      | 'rawInput'
      | 'alternateScreen'
      | 'bracketedPaste'
      | 'mouseReporting'
      | 'focusReporting'
      | 'keyboardProtocol'
      | 'cursorVisibility'
  ): Result<never> | undefined {
    const capability = this.capabilities[kind];
    if (capability.support === 'supported' && capability.availability === 'available') return undefined;
    return err(diagnostic(
      'HOST_PROTOCOL_UNSUPPORTED',
      `Terminal protocol is unavailable: ${kind}.`,
      {
        severity: 'warning',
        target: this.id,
        data: {
          capability: kind,
          support: capability.support,
          availability: capability.availability,
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
      case 'keyboardProfile':
        if (this.#ownsKeyboardProfileStackFrame) {
          await this.#protocol.popKeyboardProfile();
          this.#ownsKeyboardProfileStackFrame = false;
        } else if (operation.enabled.kind === 'kitty') {
          await this.#protocol.pushKeyboardProfile(operation.enabled);
          this.#ownsKeyboardProfileStackFrame = true;
        }
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

function keyboardProfilesEqual(left: TerminalKeyboardProfile, right: TerminalKeyboardProfile): boolean {
  return left.kind === right.kind
    && (left.kind === 'legacy' || (right.kind === 'kitty' && left.flags === right.flags));
}
