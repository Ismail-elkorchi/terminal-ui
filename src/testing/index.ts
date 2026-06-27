export type {
  FocusAssertion,
  HitTargetAssertion,
  InteractionResult,
  InteractionScript,
  InteractionStep,
  PtyTerminalHarness,
  PtyTerminalHarnessOptions,
  PtyTerminalHarnessResult,
  SelectedAssertion,
  SnapshotAssertion,
  TerminalHarness,
  TerminalHarnessOptions,
  VisibleTextAssertion
} from './types.ts';
export type {
  VisualSnapshotArtifacts,
  VisualSnapshotInput
} from './visual-snapshots.ts';
export type { ControlledTerminalClock } from '../host/index.ts';
export { createTerminalHarness, toAccessibleSnapshotFromHarness as toAccessibleSnapshot } from './harness.ts';
export { createPtyTerminalHarness, isPtyHarnessUnavailable } from './pty-harness.ts';
export { createVisualSnapshot } from './visual-snapshots.ts';
export {
  assertFocus,
  assertHitTarget,
  assertNoSecretLeak,
  assertSelected,
  assertTerminalRestored,
  assertVisibleText
} from './assertions.ts';
export { replayTranscript, runInteractionScript } from './script.ts';
