import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { ControlledTerminalClock, MemoryTerminalHost, TerminalHost, TerminalViewport } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../tui/index.ts';
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
