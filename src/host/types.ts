import type { RuntimeTarget } from '../package.ts';
import type { Result } from '../result.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';

export interface TerminalViewport {
  readonly columns: number;
  readonly rows: number;
}

export interface TerminalOutputChunk {
  readonly text?: string;
  readonly bytes?: Uint8Array;
}

export interface TerminalInputChunk {
  readonly data: string | Uint8Array;
}

export interface TerminalInput {
  read(): AsyncIterable<TerminalInputChunk>;
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

export interface TerminalHost {
  readonly id: string;
  readonly runtime: RuntimeTarget;
  readonly stdin: TerminalInput;
  readonly stdout: TerminalOutput;
  readonly stderr?: TerminalOutput;
  readonly signals: TerminalSignalSource;
  readonly clock: TerminalClock;
  readonly env: TerminalEnvironment;

  getViewport(): TerminalViewport;
  getCapabilities(): Promise<TerminalCapabilities>;
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
  readonly capabilities: TerminalCapabilities;

  enableRawInput(): Promise<Result<TerminalStateChange>>;
  enableAlternateScreen(): Promise<Result<TerminalStateChange>>;
  enableBracketedPaste(): Promise<Result<TerminalStateChange>>;
  enableMouseReporting(mode?: MouseReportingMode): Promise<Result<TerminalStateChange>>;
  enableFocusReporting(): Promise<Result<TerminalStateChange>>;
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
  readonly cursorVisible: boolean;
}

export type TerminalStateChange =
  | { readonly kind: 'rawInput'; readonly enabled: boolean }
  | { readonly kind: 'alternateScreen'; readonly enabled: boolean }
  | { readonly kind: 'bracketedPaste'; readonly enabled: boolean }
  | { readonly kind: 'mouseReporting'; readonly enabled: MouseReportingMode }
  | { readonly kind: 'focusReporting'; readonly enabled: boolean }
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

export interface TerminalCapabilities {
  readonly schemaVersion: 'terminal-ui.terminal-capabilities.v1';
  readonly runtime: RuntimeTarget;
  readonly isTty: boolean;
  readonly color: TerminalColorCapability;
  readonly unicode: TerminalUnicodeCapability;
  readonly rawInput: CapabilitySupport;
  readonly resize: CapabilitySupport;
  readonly hyperlinks: CapabilitySupport;
  readonly enhancedKeyboard: CapabilitySupport;
  readonly bracketedPaste: CapabilitySupport;
  readonly mouseReporting: CapabilitySupport;
  readonly alternateScreen: CapabilitySupport;
  readonly focusReporting: CapabilitySupport;
  readonly cursorVisibility: CapabilitySupport;
  readonly title: CapabilitySupport;
  readonly bell: CapabilitySupport;
  readonly clipboard: CapabilitySupport;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export interface CapabilitySupport {
  readonly supported: boolean;
  readonly confidence: 'known' | 'detected' | 'assumed' | 'unknown';
  readonly reason?: string;
}

export interface TerminalColorCapability {
  readonly depth: 0 | 1 | 4 | 8 | 24;
  readonly hasBasicColors: boolean;
  readonly has256Colors: boolean;
  readonly hasTrueColor: boolean;
}

export interface TerminalUnicodeCapability {
  readonly graphemeClusters: true;
  readonly eastAsianWidth: 'narrow' | 'wide' | 'ambiguous-narrow' | 'ambiguous-wide';
  readonly emojiWidth: 'narrow' | 'wide';
  readonly bidi: 'full' | 'stable-fallback';
}

export interface NodeReadableTerminalStream extends AsyncIterable<string | Uint8Array> {
  readonly isTTY?: boolean;
  setRawMode?(enabled: boolean): void;
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
}

export interface MemoryTerminalHostOptions {
  readonly id?: string;
  readonly viewport?: TerminalViewport;
  readonly isTty?: boolean;
  readonly env?: Record<string, string>;
}

export type RuntimeInputSource =
  | AsyncIterable<string | Uint8Array>
  | ReadableStream<string | Uint8Array>;

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
}

export interface BunTerminalHostOptions {
  readonly id?: string;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
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
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
}

export interface PtyTerminalHost extends TerminalHost {
  resize(viewport: TerminalViewport): Promise<void>;
}

export type CreateTerminalHostOptions =
  | (NodeTerminalHostOptions & { readonly runtime?: 'node' })
  | (DenoTerminalHostOptions & { readonly runtime: 'deno' })
  | (BunTerminalHostOptions & { readonly runtime: 'bun' })
  | (MemoryTerminalHostOptions & { readonly runtime: 'memory' })
  | (PtyTerminalHostOptions & { readonly adapter: 'pty' });
