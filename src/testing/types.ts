import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  ControlledTerminalClock,
  MemoryTerminalHost,
  PtyTerminalHost,
  TerminalClock,
  TerminalHost,
  TerminalStateSnapshot,
  TerminalViewport
} from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../tui/index.ts';
import type { ThemeToken } from '../theme/index.ts';
import type {
  InteractionResult,
  TranscriptRecorder,
  TranscriptReplayTarget
} from '../transcript/index.ts';

export interface TerminalHarnessOptions {
  readonly viewport?: TerminalViewport;
}

export interface TerminalHarness extends TranscriptReplayTarget {
  readonly host: MemoryTerminalHost;
  readonly clock: ControlledTerminalClock;
  readonly transcript: TranscriptRecorder;
  input(event: InputEvent | string): Promise<void>;
  resize(viewport: TerminalViewport): Promise<void>;
  run<T>(operation: (host: TerminalHost) => Promise<T>): Promise<T>;
  snapshot(): AccessibleSnapshot;
  frames(): readonly Frame[];
  diffs(): readonly RenderDiff[];
  restores(): ReturnType<MemoryTerminalHost['restores']>;
  output(): string;
}

export interface PtyTerminalHarnessOptions {
  readonly id?: string;
  readonly viewport?: TerminalViewport;
  readonly available?: boolean;
}

export type PtyTerminalHarnessResult =
  | { readonly ok: true; readonly harness: PtyTerminalHarness }
  | { readonly ok: false; readonly diagnostic: TerminalDiagnostic };

export interface PtyTerminalHarness extends TranscriptReplayTarget {
  readonly host: PtyTerminalHost;
  readonly clock: TerminalClock;
  readonly transcript: TranscriptRecorder;
  input(event: InputEvent | string): Promise<void>;
  resize(viewport: TerminalViewport): Promise<void>;
  closeInput(): void;
  snapshot(): AccessibleSnapshot;
  frames(): readonly Frame[];
  diffs(): readonly RenderDiff[];
  restores(): readonly TerminalStateSnapshot[];
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
  | { readonly kind: 'resize'; readonly viewport: TerminalViewport }
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'assertSnapshot'; readonly assertion: SnapshotAssertion }
  | { readonly kind: 'assertFocus'; readonly assertion: FocusAssertion }
  | { readonly kind: 'assertSelected'; readonly assertion: SelectedAssertion }
  | { readonly kind: 'assertVisibleText'; readonly assertion: VisibleTextAssertion }
  | { readonly kind: 'assertHitTarget'; readonly assertion: HitTargetAssertion }
  | { readonly kind: 'assertOutput'; readonly includes?: string; readonly excludes?: string }
  | { readonly kind: 'assertRestore' }
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
  readonly styleToken?: ThemeToken;
}

export interface HitTargetAssertion {
  readonly row: number;
  readonly column: number;
  readonly id?: string;
}
