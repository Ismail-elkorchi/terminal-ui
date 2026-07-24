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
export { createTerminalHarness, toAccessibleSnapshotFromHarness } from './harness.ts';
export { createPtyTerminalHarness, isPtyHarnessUnavailable } from './pty-harness.ts';
export { createVisualSnapshot } from './visual-snapshots.ts';
export { applyRenderDiff } from './render-diff.ts';
export type { RenderDiffProjection } from './render-diff.ts';
export {
  createDirtyRegionSet,
  dirtyRegionsForRegionChanges
} from '../renderer/internal/dirty-regions.ts';
export type { DirtyRegionSet } from '../renderer/internal/dirty-regions.ts';
export { renderElementRegions } from '../renderer/internal/render.ts';
export type {
  RenderRegion,
  RenderRegionHitTarget
} from '../renderer/internal/render.ts';
export { placeNotificationStack } from '../renderer/internal/notifications.ts';
export { logViewerSearchStatistics } from '../renderer/internal/log-viewer/projection.ts';
export { searchPickerIndexStatistics } from '../ui-model/search-picker-index.ts';
export type {
  NotificationStackPlacementInput,
  NotificationStackSize
} from '../renderer/internal/notifications.ts';
export {
  renderScrollbars,
  scrollbarInteractionReducer,
  scrollbarLayout,
  scrollbarVisualStateForTarget
} from '../renderer/internal/scrollbar.ts';
export type {
  ScrollbarInteractionAction,
  ScrollbarInteractionState,
  ScrollbarLayout,
  ScrollbarOptions,
  ScrollbarRenderOptions,
  ScrollbarState,
  ScrollbarThumb,
  ScrollbarTrack,
  ScrollbarVisualState
} from '../renderer/internal/scrollbar.ts';
export {
  assertFocus,
  assertHitTarget,
  assertNoSecretLeak,
  assertSelected,
  assertTerminalRestored,
  assertVisibleText
} from './assertions.ts';
export { replayTranscript, runInteractionScript } from './script.ts';
