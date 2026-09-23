import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  ControlledTerminalClock,
  MemoryTerminalHost,
  PtyTerminalHost,
  TerminalClock,
  TerminalHost,
  TerminalRestoreResult,
  TerminalSize
} from '../host/index.ts';
import type { InputEvent, RecordedInputEvent } from '../input/index.ts';
import type { Frame, FrameDescriptor, RenderDiffDescriptor } from '../renderer/index.ts';
import type { ThemeColorToken } from '../theme/index.ts';
import type { TuiApp, TuiRuntime } from '../tui/types.ts';
import type {
  InteractionResult,
  TranscriptRecorder,
  TranscriptReplayTarget
} from '../transcript/index.ts';

export interface TerminalHarnessOptions {
  readonly terminalSize?: TerminalSize;
}

/** Memory-host test session. `runApp` owns runtime startup and disposal; injected events settle before returning. */
export interface TerminalHarness extends TranscriptReplayTarget {
  readonly host: MemoryTerminalHost;
  readonly clock: ControlledTerminalClock;
  readonly transcript: TranscriptRecorder;
  input(event: RecordedInputEvent | string): Promise<void>;
  resize(terminalSize: TerminalSize): Promise<void>;
  /** Waits for the next app frame published after this call. Requires an attached app. */
  nextCommit(): Promise<Frame>;
  run<T>(operation: (host: TerminalHost) => Promise<T>): Promise<T>;
  /** Starts the app, invokes the callback after its first frame, and disposes it on every exit path. */
  runApp<TState, TMessage, TResult>(
    app: TuiApp<TState, TMessage>,
    operation: (runtime: TuiRuntime<TState, TMessage>) => Promise<TResult>,
  ): Promise<TResult>;
  snapshot(): AccessibleSnapshot;
  frames(): readonly FrameDescriptor[];
  diffs(): readonly RenderDiffDescriptor[];
  restores(): ReturnType<MemoryTerminalHost['restores']>;
  output(): string;
}

export interface PtyTerminalHarnessOptions {
  readonly id?: string;
  readonly terminalSize?: TerminalSize;
  readonly available?: boolean;
}

export type PtyTerminalHarnessResult =
  | { readonly status: 'available'; readonly harness: PtyTerminalHarness }
  | { readonly status: 'unavailable'; readonly diagnostic: TerminalDiagnostic };

export interface PtyTerminalHarness extends TranscriptReplayTarget {
  readonly host: PtyTerminalHost;
  readonly clock: TerminalClock;
  readonly transcript: TranscriptRecorder;
  input(event: RecordedInputEvent | string): Promise<void>;
  resize(terminalSize: TerminalSize): Promise<void>;
  /** Waits for the next frame published by the attached app. */
  nextCommit(): Promise<Frame>;
  /** Starts an app, invokes the callback after its first frame, and always disposes it. */
  runApp<TState, TMessage, TResult>(
    app: TuiApp<TState, TMessage>,
    operation: (runtime: TuiRuntime<TState, TMessage>) => Promise<TResult>,
  ): Promise<TResult>;
  closeInput(): void;
  snapshot(): AccessibleSnapshot;
  frames(): readonly FrameDescriptor[];
  diffs(): readonly RenderDiffDescriptor[];
  restores(): readonly TerminalRestoreResult[];
  output(): string;
  dispose(): Promise<void>;
}

export interface InteractionScript {
  readonly id: string;
  readonly steps: readonly InteractionStep[];
}

export type InteractionStep =
  | { readonly kind: 'input'; readonly event: InputEvent | string }
  | { readonly kind: 'paste'; readonly text: string }
  | { readonly kind: 'resize'; readonly terminalSize: TerminalSize }
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'waitForCommit'; readonly ms: number }
  | { readonly kind: 'assertSnapshot'; readonly assertion: SnapshotAssertion }
  | { readonly kind: 'assertFocus'; readonly assertion: FocusAssertion }
  | { readonly kind: 'assertSelected'; readonly assertion: SelectedAssertion }
  | { readonly kind: 'assertVisibleText'; readonly assertion: VisibleTextAssertion }
  | { readonly kind: 'assertHitTarget'; readonly assertion: HitTargetAssertion }
  | { readonly kind: 'assertOutput'; readonly includes?: string; readonly excludes?: string }
  | { readonly kind: 'assertRestore'; readonly phase?: 'checkpoint' | 'shutdown' }
  | { readonly kind: 'assertNoSecretLeak'; readonly secret: string };

export interface SnapshotAssertion {
  readonly role?: string;
  readonly label?: string;
}

export type { InteractionResult };

export interface FocusAssertion {
  readonly id: string;
}

export interface SelectedAssertion {
  readonly id?: string;
  readonly label?: string;
  readonly value?: string | number | boolean | null;
}

export interface VisibleTextAssertion {
  readonly text: string;
  readonly styleToken?: ThemeColorToken;
}

export interface HitTargetAssertion {
  readonly row: number;
  readonly column: number;
  readonly id?: string;
}
