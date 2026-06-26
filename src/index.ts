export { terminalUiPackage } from './package.ts';
export type { RuntimeTarget, TerminalUiEntrypoint, TerminalUiPackage } from './package.ts';
export type { Result } from './result.ts';
export { ok, err } from './result.ts';
export type {
  TerminalDiagnostic,
  TerminalDiagnosticCode,
  TerminalDiagnosticValue,
  TerminalSeverity
} from './diagnostics.ts';
export { diagnostic, terminalDiagnosticCodes } from './diagnostics.ts';
export { TerminalUiError } from './errors.ts';

export {
  createBunTerminalHost,
  createDenoTerminalHost,
  createMemoryTerminalHost,
  createNodeTerminalHost,
  createPtyTerminalHost,
  createTerminalHost,
  detectTerminalCapabilities,
  restoreTerminalState
} from './host/index.ts';
export type {
  BunTerminalHostOptions,
  CreateTerminalHostOptions,
  DenoTerminalHostOptions,
  MemoryTerminalHost,
  MemoryTerminalHostOptions,
  NodeProcessLike,
  NodeReadableTerminalStream,
  NodeTerminalHostOptions,
  NodeTerminalSignal,
  NodeWritableTerminalStream,
  PtyTerminalHost,
  PtyTerminalHostOptions,
  RuntimeInputSource,
  RuntimeTerminalInputOptions,
  RuntimeTerminalOutputOptions,
  TerminalCapabilities,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalSessionOptions,
  TerminalSignal,
  TerminalSignalSource,
  TerminalStateChange,
  TerminalStateSnapshot,
  TerminalViewport
} from './host/index.ts';
export type {
  EndOfInputEvent,
  FocusEvent,
  InputDecodeOptions,
  InputDecoder,
  InputEvent,
  KeyEvent,
  KeyEventLike,
  KeyName,
  MouseAction,
  MouseButton,
  MouseEncoding,
  MouseEvent,
  MouseModifiers,
  PasteEvent,
  ResizeEvent,
  SignalEvent,
  TextInputEvent,
  UnknownInputEvent
} from './input/index.ts';
export type {
  TerminalProtocolWriter,
  TerminalRestorePlan
} from './protocol/index.ts';
export type {
  GraphemeSegment,
  RemovedControlSequence,
  SanitizedTerminalText,
  SanitizeTerminalTextOptions,
  TextCellMetrics,
  TextClipOptions,
  TextClipResult,
  TextEditBuffer,
  TextEditOperation,
  TextLine,
  TextMeasurementOptions,
  TextSelection,
  TextWrapOptions
} from './text/index.ts';
export type {
  AnsiColor,
  StyledEmphasis,
  StyledText,
  StyledTone,
  TerminalSpacing,
  TerminalStyles,
  TerminalSymbols,
  TerminalTextStyle,
  TerminalTheme,
  TerminalThemeDefinition
} from './theme/index.ts';

export {
  autocomplete,
  confirm,
  createProgress,
  editor,
  input,
  multiselect,
  password,
  progress,
  runPrompt,
  select
} from './prompts/index.ts';
export type {
  AutocompletePromptOptions,
  ConfirmPromptOptions,
  EditorPromptOptions,
  InputPromptOptions,
  MultiSelectPromptOptions,
  NonTtyMode,
  NonTtyPromptPolicy,
  PasswordPromptOptions,
  ProgressController,
  PromptEditorAdapter,
  PromptEditorCommand,
  PromptEditorCommandSource,
  PromptEditorRequest,
  PromptEditorResult,
  ProgressOptions,
  ProgressPromptOptions,
  ProgressResult,
  ProgressState,
  PromptAbortReason,
  PromptAbortResult,
  PromptChoice,
  PromptDataSource,
  PromptDataSourceQuery,
  PromptDataSourceResult,
  PromptDefinition,
  PromptKind,
  PromptProgressState,
  PromptRenderer,
  PromptResult,
  PromptSubmitResult,
  PromptValidationContext,
  PromptValidationResult,
  PromptValidator,
  SelectPromptOptions
} from './prompts/index.ts';
export { createShell, runShell } from './shell/index.ts';
export { createCliCoreCommandSource, createCommandPalette } from './shell/index.ts';
export type {
  CliCoreCommandSourceInput,
  CliCoreShellAdapter,
  CommandPalette,
  CommandPaletteOptions,
  ShellCheckpoint,
  ShellCheckpointPolicy,
  ShellArgvParser,
  ShellCommandParseInput,
  ShellCommandSource,
  ShellEvent,
  ShellExit,
  ShellHelpPreview,
  ShellHistoryEntry,
  ShellHistoryProvider,
  ShellMode,
  ShellNonTtyPolicy,
  ShellOptions,
  ShellPaletteAction,
  ShellPromptRenderer,
  ShellRunPolicy,
  ShellRunRequest,
  ShellState,
  ShellSuggestion,
  ShellTranscript,
  ShellTranscriptCommand,
  ShellTranscriptCommandStatus,
  ShellTransientLayer,
  TerminalShell
} from './shell/index.ts';
export {
  activeScreen,
  commandBarReducer,
  commandPaletteWindow,
  createTuiRuntime,
  createScrollState,
  defineTui,
  diffFrames,
  extractScrollbackSelectionText,
  filterCommandPaletteEntries,
  gridCellRects,
  layoutWidget,
  normalizeScrollState,
  renderDiff,
  renderFrame,
  renderWidgetFrame,
  screenStackReducer,
  scrollReducer,
  scrollbackWindow,
  splitTracks,
  visibleWindowFromScroll,
  runTui
} from './tui/index.ts';
export type {
  CommandBarAction,
  CommandBarState,
  CommandPaletteFilterResult,
  CommandPaletteWindowInput,
  CreateScrollStateInput,
  Frame,
  LayoutTrack,
  LayoutNode,
  Rect,
  RenderDiff,
  RenderFrameOptions,
  RenderOperation,
  Screen,
  ScreenStack,
  ScreenStackAction,
  ScrollAction,
  ScrollState,
  ExtractScrollbackSelectionTextInput,
  ScrollbackTextSegment,
  ScrollbackVisibleRow,
  ScrollbackWindow,
  ScrollVisibleWindow,
  TuiApp,
  TuiCommand,
  TuiContext,
  TuiDefinition,
  TuiEventSource,
  TuiExit,
  TuiExitHandler,
  TuiExitRequest,
  TuiInit,
  TuiInputResult,
  TuiMessageSource,
  TuiRuntime,
  TuiRuntimeChange,
  TuiRuntimeOptions,
  TuiSubscriptionContext,
  TuiSubscriptions,
  TuiUpdate,
  TuiUpdateResult,
  TuiView
} from './tui/index.ts';
export type {
  AccessibleNodeDefinition,
  BoxWidgetOptions,
  CommandBarSuggestion,
  CommandBarWidgetOptions,
  CommandPaletteEntry,
  CommandPaletteWidgetOptions,
  GridWidgetOptions,
  InputFieldWidgetOptions,
  ListWidgetOptions,
  ModalWidgetOptions,
  ProgressBarWidgetOptions,
  RowWidgetOptions,
  ScrollbackItem,
  ScrollbackWidgetOptions,
  SpinnerWidgetOptions,
  StackWidgetOptions,
  StructuredBlock,
  StructuredBlockField,
  StructuredBlockStatus,
  StructuredBlockWidgetOptions,
  StatusBarWidgetOptions,
  SplitPaneWidgetOptions,
  TabItem,
  TableWidgetOptions,
  TabsWidgetOptions,
  TextWidgetOptions,
  ViewportWidgetOptions,
  ActivityFeedWidgetOptions,
  Widget,
  WidgetChildren,
  WidgetKeyMap,
  WidgetKind,
  WidgetMouseMap,
  WidgetProps
} from './widgets/index.ts';
export {
  accessibleRoles,
  accessibleSources,
  findAccessibleNode,
  toAccessibleSnapshot,
  validateAccessibleSnapshot
} from './accessibility/index.ts';
export type {
  AccessibleNode,
  AccessibleProgress,
  AccessibleRole,
  AccessibleSnapshot,
  AccessibleSnapshotInput,
  AccessibleSnapshotSource,
  AccessibleValue
} from './accessibility/index.ts';
export { redactTranscript, replayTranscript, validateTranscript } from './transcript/index.ts';
export type {
  InteractionResult,
  InteractionTranscript,
  InteractionTranscriptStep,
  RedactionPolicy,
  TranscriptPolicy,
  TranscriptRecorderOptions,
  TranscriptRecorder,
  TranscriptRedaction,
  TranscriptReplayTarget,
  TranscriptSource
} from './transcript/index.ts';
export {
  assertFocus,
  assertNoSecretLeak,
  assertTerminalRestored,
  createTerminalHarness,
  runInteractionScript
} from './testing/index.ts';
export type {
  FocusAssertion,
  InteractionScript,
  InteractionStep,
  SnapshotAssertion,
  TerminalHarness,
  TerminalHarnessOptions
} from './testing/index.ts';

export * as host from './host/index.ts';
export * as protocol from './protocol/index.ts';
export * as text from './text/index.ts';
export * as theme from './theme/index.ts';
export * as prompts from './prompts/index.ts';
export * as shell from './shell/index.ts';
export * as tui from './tui/index.ts';
export * as widgets from './widgets/index.ts';
export * as accessibility from './accessibility/index.ts';
export * as transcript from './transcript/index.ts';
export * as testing from './testing/index.ts';
export * as schemas from './schemas/index.ts';
