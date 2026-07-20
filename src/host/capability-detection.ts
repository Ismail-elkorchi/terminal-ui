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

const KITTY_KEYBOARD_QUERY = '\u001B[?u';
const DEFAULT_PROBE_TIMEOUT_MS = 100;
const PROBE_TIMER_CLOSED = 'terminal_capability_probe_completed';

export interface TerminalCapabilityDetectorOptions {
  readonly input: TerminalInputAuthority;
  readonly clock: TerminalClock;
  readonly resolverInput: TerminalCapabilityResolverInput;
  readonly beginSession: (id: string, capabilities: TerminalCapabilityProfile) => Promise<TerminalSession>;
  readonly write: (output: TerminalOutputChunk, signal: AbortSignal) => Promise<TerminalWriteReceipt>;
}

export class TerminalCapabilityDetector {
  readonly #options: TerminalCapabilityDetectorOptions;
  readonly #probeFacts: ProtocolProbeFacts;
  #profile: TerminalCapabilityProfile;
  #keyboardProbe: Promise<void> | undefined;
  #keyboardProbed = false;

  constructor(options: TerminalCapabilityDetectorOptions) {
    this.#options = options;
    this.#probeFacts = { ...options.resolverInput.probes };
    this.#profile = this.#resolve();
  }

  current(): TerminalCapabilityProfile {
    return this.#profile;
  }

  async detect(options: TerminalCapabilityDetectionOptions = {}): Promise<TerminalCapabilityProfile> {
    if (
      options.activeProbes?.includes('keyboardProtocol') === true
      && this.#profile.keyboardProtocol.support === 'unknown'
      && this.#profile.keyboardProtocol.availability === 'available'
      && !this.#keyboardProbed
    ) {
      this.#keyboardProbe ??= this.#probeKeyboard(options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS)
        .finally(() => {
          this.#keyboardProbed = true;
        });
      await waitForTerminalOperation(
        this.#keyboardProbe,
        options.signal === undefined ? {} : { signal: options.signal }
      );
    }
    return this.#profile;
  }

  async #probeKeyboard(timeoutMs: number): Promise<void> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('Capability probe timeout must be a positive finite number.');
    }
    const operationController = new AbortController();
    const timerController = new AbortController();
    const timeout = this.#options.clock.sleep(timeoutMs, timerController.signal).then(
      () => {
        if (!timerController.signal.aborted) operationController.abort('terminal_capability_probe_timeout');
      },
      (cause: unknown) => {
        if (!timerController.signal.aborted) operationController.abort(cause);
      }
    );
    void timeout.catch(() => undefined);
    const session = await this.#options.beginSession('terminal-capability-probe', this.#profile);
    try {
      const raw = await session.enableRawInput({ signal: operationController.signal });
      if (raw.status !== 'applied') {
        this.#recordKeyboardProbe('unknown');
        return;
      }
      const receipt = await this.#options.write({ text: KITTY_KEYBOARD_QUERY }, operationController.signal);
      if (receipt.status !== 'committed') {
        this.#recordKeyboardProbe('unknown');
        return;
      }
      const result = await this.#options.input.probeKittyKeyboard(operationController.signal);
      this.#recordKeyboardProbe(result.status === 'supported' ? 'supported' : 'unknown');
    } finally {
      timerController.abort(PROBE_TIMER_CLOSED);
      await session.restore('success');
    }
  }

  #recordKeyboardProbe(support: 'supported' | 'unknown'): void {
    this.#probeFacts.keyboardProtocol = support;
    this.#profile = this.#resolve();
  }

  #resolve(): TerminalCapabilityProfile {
    return resolveTerminalCapabilities({
      ...this.#options.resolverInput,
      probes: this.#probeFacts
    });
  }
}
