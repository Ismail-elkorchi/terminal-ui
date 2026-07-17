import type { RuntimeTarget } from './capability-types.ts';
import type { Result } from '../result.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';
import type { TerminalCapabilityConfiguration } from './capabilities.ts';
import type { ViewportSize } from '../geometry/types.ts';

export type TerminalViewport = Readonly<ViewportSize>;

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

export interface TerminalInput {
  read(options?: TerminalInputReadOptions): AsyncIterable<TerminalInputChunk>;
  setRawMode?(enabled: boolean): Promise<void> | void;
  isRawModeEnabled?(): boolean;
  isTty(): boolean;
}

export interface TerminalOutput {
  write(chunk: string | Uint8Array): Promise<void> | void;
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
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface ControlledTerminalClock extends TerminalClock {
  advance(ms: number): void;
}

export interface TerminalEnvironment {
  get(name: string): string | undefined;
  entries(): Iterable<readonly [string, string]>;
}

export interface TerminalViewportControl {
  setViewport(viewport: TerminalViewport): void | Promise<void>;
}

export interface TerminalHostObserver {
  recordFrame?(frame: unknown): void;
  recordDiff?(diff: unknown): void;
  recordRestore?(checkpoint: TerminalStateSnapshot): void;
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
  readonly viewportControl?: TerminalViewportControl;
  readonly observer?: TerminalHostObserver;

  getViewport(): TerminalViewport;
  getCapabilities(): Promise<TerminalCapabilityProfile>;
  beginSession(options?: TerminalSessionOptions): Promise<TerminalSession>;
  write(output: TerminalOutputChunk): Promise<void>;
  flush?(): Promise<void>;
  dispose?(): Promise<void>;
}

export interface TerminalSessionOptions {
  readonly id?: string;
}

export interface TerminalSession {
  readonly id: string;
  readonly host: TerminalHost;
  readonly startedAt: number;
  readonly initialState: TerminalStateSnapshot;
  readonly capabilities: TerminalCapabilityProfile;

  enableRawInput(): Promise<Result<TerminalStateChange>>;
  enableAlternateScreen(): Promise<Result<TerminalStateChange>>;
  enableBracketedPaste(): Promise<Result<TerminalStateChange>>;
  enableMouseReporting(mode?: MouseReportingMode): Promise<Result<TerminalStateChange>>;
  enableFocusReporting(): Promise<Result<TerminalStateChange>>;
  enableEnhancedKeyboard(): Promise<Result<TerminalStateChange>>;
  hideCursor(): Promise<Result<TerminalStateChange>>;
  showCursor(): Promise<Result<TerminalStateChange>>;
  restore(reason?: TerminalRestoreReason): Promise<TerminalRestoreResult>;
}

export interface TerminalStateSnapshot {
  readonly rawInput: boolean;
  readonly alternateScreen: boolean;
  readonly bracketedPaste: boolean;
  readonly mouseReporting: MouseReportingMode;
  readonly focusReporting: boolean;
  readonly enhancedKeyboard: boolean;
  readonly cursorVisible: boolean;
}

export type TerminalStateChange =
  | { readonly kind: 'rawInput'; readonly enabled: boolean }
  | { readonly kind: 'alternateScreen'; readonly enabled: boolean }
  | { readonly kind: 'bracketedPaste'; readonly enabled: boolean }
  | { readonly kind: 'mouseReporting'; readonly enabled: MouseReportingMode }
  | { readonly kind: 'focusReporting'; readonly enabled: boolean }
  | { readonly kind: 'enhancedKeyboard'; readonly enabled: boolean }
  | { readonly kind: 'cursorVisible'; readonly enabled: boolean };

export interface TerminalRestoreResult {
  readonly ok: boolean;
  readonly reason: TerminalRestoreReason;
  readonly restored: readonly TerminalStateChange[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type TerminalRestoreReason =
  | 'success'
  | 'cancelled'
  | 'interrupted'
  | 'timeout'
  | 'error'
  | 'disposed';

export type MouseReportingMode = 'none' | 'click' | 'drag' | 'all';

export interface NodeReadableTerminalStream extends AsyncIterable<string | Uint8Array> {
  readonly isTTY?: boolean;
  setRawMode?(enabled: boolean): void;
  pause?(): void;
  resume?(): void;
  unref?(): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface NodeWritableTerminalStream {
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
  write(chunk: string | Uint8Array): void;
}

export type NodeTerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGWINCH';

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
}

export interface MemoryTerminalHostOptions {
  readonly id?: string;
  readonly viewport?: TerminalViewport;
  readonly isTty?: boolean;
  readonly clipboard?: boolean;
  readonly env?: Record<string, string>;
  readonly observer?: TerminalHostObserver;
  readonly capabilities?: TerminalCapabilityConfiguration;
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
  readonly write?: (chunk: string | Uint8Array) => void | Promise<void>;
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
}

export interface BunTerminalHostOptions {
  readonly id?: string;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
  readonly capabilities?: TerminalCapabilityConfiguration;
}

export interface PtyTerminalHostOptions {
  readonly id?: string;
  readonly runtime?: RuntimeTarget;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
  readonly viewport?: TerminalViewport;
  readonly resize?: (viewport: TerminalViewport) => void | Promise<void>;
  readonly observer?: TerminalHostObserver;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
  readonly capabilities?: TerminalCapabilityConfiguration;
}

export interface PtyTerminalHost extends TerminalHost {
  readonly viewportControl: TerminalViewportControl;
}

export type CreateTerminalHostOptions =
  | (NodeTerminalHostOptions & { readonly runtime: 'node' })
  | (DenoTerminalHostOptions & { readonly runtime: 'deno' })
  | (BunTerminalHostOptions & { readonly runtime: 'bun' })
  | (MemoryTerminalHostOptions & { readonly runtime: 'memory' })
  | (PtyTerminalHostOptions & { readonly adapter: 'pty' });
