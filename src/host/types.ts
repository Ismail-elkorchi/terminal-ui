import type { RuntimeTarget } from './capability-types.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';
import type { TerminalCapabilityConfiguration } from './capabilities.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';
import type { MouseReportingMode, MouseReportingState } from '../protocol/index.ts';

export type { TerminalSize } from '../geometry/types.ts';
export type { MouseReportingMode } from '../protocol/index.ts';
export type { MouseReportingEncoding, MouseReportingState } from '../protocol/index.ts';

export interface TerminalOutputChunk {
  readonly text?: string;
  readonly bytes?: Uint8Array;
}

export interface TerminalInputChunk {
  readonly data: string | Uint8Array;
}

export interface TerminalInputReadOptions {
  readonly signal?: AbortSignal;
}

export interface TerminalOperationContext {
  readonly signal?: AbortSignal;
}

export interface TerminalRestoreOptions {
  /** Stops only this caller from waiting for a shared restoration. */
  readonly waitSignal?: AbortSignal;
  /** Bounds the authority operation when this caller creates it. */
  readonly operationSignal?: AbortSignal;
}

export type TerminalActiveCapabilityProbe = 'keyboardProtocol' | 'terminalModes';

export interface TerminalCapabilityDetectionOptions {
  readonly activeProbes?: readonly TerminalActiveCapabilityProbe[];
  readonly refresh?: boolean;
  readonly probeTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface TerminalInput {
  read(options?: TerminalInputReadOptions): AsyncIterable<TerminalInputChunk>;
  /** Settles only when the previous reader can no longer consume input. */
  release?(): Promise<void>;
  setRawMode?(enabled: boolean): Promise<void> | void;
  isRawModeEnabled?(): boolean;
  isTty(): boolean;
}

export interface TerminalOutput {
  write(chunk: string | Uint8Array, context?: TerminalOperationContext): Promise<void>;
  writeRecovery(chunk: string | Uint8Array, context?: TerminalOperationContext): Promise<TerminalWriteReceipt>;
  flush(context?: TerminalOperationContext): Promise<void>;
  dispose(context?: TerminalOperationContext): Promise<void>;
  isTty(): boolean;
  readonly columns: number | undefined;
  readonly rows: number | undefined;
}

export type Unsubscribe = () => void;

export type TerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'resize';

export interface TerminalSignalSource {
  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe;
}

export interface TerminalClock {
  monotonicNow(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface ControlledTerminalClock extends TerminalClock {
  advance(ms: number): void;
}

export interface TerminalEnvironment {
  get(name: string): string | undefined;
  entries(): Iterable<readonly [string, string]>;
}

export interface TerminalSizeControl {
  setTerminalSize(terminalSize: TerminalSize): void | Promise<void>;
}

export interface TerminalHostObserver {
  recordFrame?(frame: unknown): void;
  recordDiff?(diff: unknown): void;
  recordRestore?(result: TerminalRestoreResult): void;
}

export interface TerminalHost {
  readonly id: string;
  readonly runtime: RuntimeTarget;
  readonly stdin: TerminalInput;
  readonly stdout: TerminalOutput;
  readonly stderr?: TerminalOutput;
  readonly signals: TerminalSignalSource;
  readonly clock: TerminalClock;
  readonly env: TerminalEnvironment;
  readonly terminalSizeControl?: TerminalSizeControl;
  readonly observer?: TerminalHostObserver;

  getTerminalSize(): TerminalSize;
  getCapabilities(options?: TerminalCapabilityDetectionOptions): Promise<TerminalCapabilityProfile>;
  beginSession(options?: TerminalSessionOptions): Promise<TerminalSession>;
  restoreTerminalState(reason: TerminalRestoreReason, options?: TerminalRestoreOptions): Promise<TerminalRestoreResult>;
  recoverTerminalState(reason: TerminalRestoreReason, options?: TerminalRestoreOptions): Promise<TerminalRestoreResult>;
  write(output: TerminalOutputChunk, context?: TerminalOperationContext): Promise<TerminalWriteReceipt>;
  writeRecovery(output: TerminalOutputChunk, context?: TerminalOperationContext): Promise<TerminalWriteReceipt>;
  flush(context?: TerminalOperationContext): Promise<void>;
  dispose(context?: TerminalOperationContext): Promise<void>;
}

export interface TerminalSessionOptions {
  readonly id?: string;
}

export type TerminalWriteReceipt =
  | { readonly status: 'committed' }
  | { readonly status: 'failed_before_write'; readonly diagnostic: TerminalDiagnostic }
  | { readonly status: 'indeterminate'; readonly diagnostic: TerminalDiagnostic };

export interface TerminalSession {
  readonly id: string;
  readonly host: TerminalHost;
  readonly initialState: TerminalStateSnapshot;
  readonly capabilities: TerminalCapabilityProfile;

  currentState(): Promise<TerminalStateSnapshot>;
  enableRawInput(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  enableAlternateScreen(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  enableBracketedPaste(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  enableMouseReporting(mode?: MouseReportingMode, context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  enableFocusReporting(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  enableUnicodeGraphemeMode(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  enableKeyboardProfile(
    profile: TerminalKeyboardProfile,
    context?: TerminalOperationContext
  ): Promise<TerminalOperationOutcome>;
  hideCursor(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  showCursor(context?: TerminalOperationContext): Promise<TerminalOperationOutcome>;
  restore(reason?: TerminalRestoreReason, options?: TerminalRestoreOptions): Promise<TerminalRestoreResult>;
}

export type TerminalOperationOutcome =
  | {
      readonly status: 'applied';
      /** Evidence for the resulting terminal state, independent of transport completion. */
      readonly assurance: TerminalOperationAssurance;
      readonly change: TerminalStateChange;
      readonly diagnostics: readonly TerminalDiagnostic[];
    }
  | {
      readonly status: 'rejected';
      readonly diagnostic: TerminalDiagnostic;
      readonly diagnostics: readonly TerminalDiagnostic[];
    }
  | {
      readonly status: 'indeterminate';
      readonly attempted: TerminalStateChange;
      readonly diagnostic: TerminalDiagnostic;
      readonly diagnostics: readonly TerminalDiagnostic[];
    };

export type TerminalOperationAssurance = 'observed' | 'sent' | 'assumed';

export interface TerminalStateSnapshot {
  readonly rawInput: boolean;
  readonly alternateScreen: boolean;
  readonly bracketedPaste: boolean;
  readonly mouseReporting: MouseReportingState;
  readonly focusReporting: boolean;
  readonly unicodeGraphemeMode: boolean;
  readonly keyboardProfile: TerminalKeyboardProfile;
  readonly cursorVisible: boolean;
  readonly provenance: TerminalStateProvenanceSnapshot;
}

export type TerminalStateKnowledge =
  | 'observed'
  | 'explicit'
  | 'library_known'
  | 'assumed'
  | 'indeterminate';

export interface TerminalStateProvenanceSnapshot {
  readonly rawInput: TerminalStateKnowledge;
  readonly alternateScreen: TerminalStateKnowledge;
  readonly bracketedPaste: TerminalStateKnowledge;
  readonly mouseReporting: TerminalStateKnowledge;
  readonly focusReporting: TerminalStateKnowledge;
  readonly unicodeGraphemeMode: TerminalStateKnowledge;
  readonly keyboardProfile: TerminalStateKnowledge;
  readonly cursorVisible: TerminalStateKnowledge;
}

export type TerminalInitialState = Partial<Omit<TerminalStateSnapshot, 'provenance'>>;

export type TerminalStateChange =
  | { readonly kind: 'rawInput'; readonly enabled: boolean }
  | { readonly kind: 'alternateScreen'; readonly enabled: boolean }
  | { readonly kind: 'bracketedPaste'; readonly enabled: boolean }
  | { readonly kind: 'mouseReporting'; readonly enabled: MouseReportingState }
  | { readonly kind: 'focusReporting'; readonly enabled: boolean }
  | { readonly kind: 'unicodeGraphemeMode'; readonly enabled: boolean }
  | { readonly kind: 'keyboardProfile'; readonly enabled: TerminalKeyboardProfile }
  | { readonly kind: 'cursorVisible'; readonly enabled: boolean };

export type TerminalRestoreCompletion = TerminalStateChange & {
  /** Evidence for this restored state, independent of output transport completion. */
  readonly assurance: Exclude<TerminalOperationAssurance, 'assumed'>;
};

export interface TerminalRestoreResult {
  readonly status: 'restored' | 'partial' | 'failed';
  readonly reason: TerminalRestoreReason;
  readonly requested: TerminalStateSnapshot;
  readonly attempted: readonly TerminalStateChange[];
  readonly completed: readonly TerminalRestoreCompletion[];
  readonly resultingState: TerminalStateSnapshot;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type TerminalRestoreReason =
  | 'success'
  | 'cancelled'
  | 'interrupted'
  | 'timeout'
  | 'error'
  | 'disposed';

export interface NodeReadableTerminalStream extends AsyncIterable<string | Uint8Array> {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  iterator?(options?: { readonly destroyOnReturn?: boolean }): AsyncIterator<string | Uint8Array>;
  setRawMode?(enabled: boolean): void;
  pause?(): void;
  resume?(): void;
  unref?(): void;
  on?(event: 'data' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void): void;
  off?(event: 'data' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void): void;
}

export interface NodeWritableTerminalStream {
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
  getColorDepth?(env?: Record<string, string | undefined>): number;
  write(chunk: string | Uint8Array, callback: (error?: Error | null) => void): boolean;
  once(event: 'drain' | 'error' | 'close', listener: (...args: unknown[]) => void): void;
  on?(event: 'resize', listener: () => void): void;
  off(event: 'drain' | 'error' | 'close' | 'resize', listener: (...args: unknown[]) => void): void;
}

export type NodeTerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

export interface NodeProcessLike {
  readonly stdin: NodeReadableTerminalStream;
  readonly stdout: NodeWritableTerminalStream;
  readonly stderr: NodeWritableTerminalStream;
  readonly env: Record<string, string | undefined>;
  on(signal: NodeTerminalSignal, listener: (signal: NodeTerminalSignal) => void): void;
  off(signal: NodeTerminalSignal, listener: (signal: NodeTerminalSignal) => void): void;
}

export interface NodeTerminalHostOptions {
  readonly id?: string;
  readonly stdin?: NodeReadableTerminalStream;
  readonly stdout?: NodeWritableTerminalStream;
  readonly stderr?: NodeWritableTerminalStream;
  readonly env?: Record<string, string | undefined>;
  readonly process?: NodeProcessLike;
  readonly capabilities?: TerminalCapabilityConfiguration;
  readonly initialState?: TerminalInitialState;
}

export interface MemoryTerminalHostOptions {
  readonly id?: string;
  readonly terminalSize?: TerminalSize;
  readonly isTty?: boolean;
  readonly clipboardWrite?: boolean;
  readonly env?: Record<string, string>;
  readonly observer?: TerminalHostObserver;
  readonly capabilities?: TerminalCapabilityConfiguration;
  readonly initialState?: TerminalInitialState;
}

export interface RuntimeInputSource {
  read(options?: TerminalInputReadOptions): AsyncIterable<string | Uint8Array>;
}

export interface RuntimeTerminalInputOptions {
  readonly source?: RuntimeInputSource;
  readonly isTty?: boolean;
  readonly setRawMode?: (enabled: boolean) => void | Promise<void>;
  readonly isRawModeEnabled?: () => boolean;
}

export interface RuntimeTerminalOutputOptions {
  readonly write?: (chunk: string | Uint8Array, context: TerminalOperationContext) => void | Promise<void>;
  readonly recoveryWrite?: (chunk: string | Uint8Array, context: TerminalOperationContext) => void | Promise<void>;
  readonly writable?: WritableStream<Uint8Array>;
  readonly isTty?: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

export interface DenoTerminalHostOptions {
  readonly id?: string;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
  readonly capabilities?: TerminalCapabilityConfiguration;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
  readonly initialState?: TerminalInitialState;
}

export interface BunTerminalHostOptions {
  readonly id?: string;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
  readonly capabilities?: TerminalCapabilityConfiguration;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
  readonly initialState?: TerminalInitialState;
}

export interface PtyTerminalHostOptions {
  readonly id?: string;
  readonly runtime?: RuntimeTarget;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
  readonly terminalSize?: TerminalSize;
  readonly resize?: (terminalSize: TerminalSize) => void | Promise<void>;
  readonly observer?: TerminalHostObserver;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
  readonly capabilities?: TerminalCapabilityConfiguration;
  readonly initialState?: TerminalInitialState;
}

export interface PtyTerminalHost extends TerminalHost {
  readonly terminalSizeControl: TerminalSizeControl;
}

export type CreateTerminalHostOptions =
  | (NodeTerminalHostOptions & { readonly runtime: 'node' })
  | (DenoTerminalHostOptions & { readonly runtime: 'deno' })
  | (BunTerminalHostOptions & { readonly runtime: 'bun' })
  | (MemoryTerminalHostOptions & { readonly runtime: 'memory' })
  | (PtyTerminalHostOptions & { readonly adapter: 'pty' });
