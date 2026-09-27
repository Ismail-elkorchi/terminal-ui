export type { ControlledTerminalClock } from '../host/types.ts';
export { replayTranscript } from '../transcript/replay.ts';
export type { InteractionResult } from '../transcript/types.ts';
export {
  assertFocus,
  assertHitTarget,
  assertNoSecretLeak,
  assertSelected,
  assertTerminalRestored,
  assertVisibleText,
} from './assertions.ts';
export { createTerminalHarness } from './harness.ts';
export { keyInput, pasteInput, pointerInput, wheelInput } from './input-events.ts';
export { createPtyTerminalHarness, isPtyHarnessUnavailable } from './pty-harness.ts';
export { InteractionScriptError, runInteractionScript } from './script.ts';
export type {
  FocusAssertion,
  HitTargetAssertion,
  InteractionScript,
  InteractionStep,
  PtyTerminalHarness,
  PtyTerminalHarnessOptions,
  PtyTerminalHarnessResult,
  SelectedAssertion,
  SnapshotAssertion,
  TerminalHarness,
  TerminalHarnessOptions,
  VisibleTextAssertion,
} from './types.ts';
export { createVisualSnapshot, renderElementSnapshot } from './visual-snapshots.ts';
export type {
  ElementSnapshotInput,
  ElementSnapshotResult,
  VisualSnapshotArtifacts,
  VisualSnapshotInput,
} from './visual-snapshots.ts';
