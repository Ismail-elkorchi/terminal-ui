export type {
  FocusAssertion,
  InteractionResult,
  InteractionScript,
  InteractionStep,
  PtyTerminalHarness,
  PtyTerminalHarnessOptions,
  PtyTerminalHarnessResult,
  SnapshotAssertion,
  TerminalHarness,
  TerminalHarnessOptions
} from './types.ts';
export type { ControlledTerminalClock } from '../host/index.ts';
export { createTerminalHarness, toAccessibleSnapshotFromHarness as toAccessibleSnapshot } from './harness.ts';
export { createPtyTerminalHarness, isPtyHarnessUnavailable } from './pty-harness.ts';
export {
  assertFocus,
  assertNoSecretLeak,
  assertTerminalRestored
} from './assertions.ts';
export { replayTranscript, runInteractionScript } from './script.ts';
