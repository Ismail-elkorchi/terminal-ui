# `@ismail-elkorchi/terminal-ui` Product Implementation Spec

## Status and authority

This is the feature-complete product implementation specification for the public TypeScript package `@ismail-elkorchi/terminal-ui`.

This document is product-focused. It describes the package that must exist in the product repository, its public API, its internal architecture, its runtime adapters, its testing and conformance expectations, and its integration boundaries with `@ismail-elkorchi/cli-core` and `argv-flags`.

This is not an MVP plan. Implementation may be sequenced, but the target described here is the complete product.

## Product identity

- Package name: `@ismail-elkorchi/terminal-ui`.
- Product repository: `Ismail-elkorchi/terminal-ui`.
- Language: TypeScript.
- Module format: ESM only.
- Runtime targets: Node `>=24`, current Deno, and current Bun.
- Distribution targets:
  - npm package for Node and Bun consumers.
  - JSR package for Deno and cross-runtime TypeScript consumers.
- Core promise: deterministic, typed, accessible, replayable terminal interaction primitives for prompts, shell loops, terminal hosts, widgets, and full-screen terminal UI.

## Product mission

`terminal-ui` provides the terminal interaction layer for TypeScript and JavaScript CLI products. It owns the concerns that live above command-core semantics and below product-specific workflows:

- terminal host abstraction and capability detection;
- raw input normalization;
- terminal protocol mode management and restoration;
- Unicode-aware text measurement, editing, wrapping, clipping, and sanitization;
- prompt primitives;
- shell loops and command palettes powered by `cli-core` programs or manifests;
- reusable widgets;
- full-screen TUI rendering;
- accessible snapshots;
- deterministic transcripts and replay;
- public testing harnesses for downstream consumers.

The product must make interactive terminal software safer for humans, screen-reader users, automated tests, coding agents, CI, and non-TTY environments.

## Package boundaries

### Owned by `terminal-ui`

`terminal-ui` owns:

- runtime-agnostic terminal host contracts;
- Node, Deno, Bun, memory, and PTY-style host adapters;
- terminal capability detection;
- terminal protocol enable/disable/restore state;
- raw key, paste, mouse, resize, focus, and signal event normalization;
- terminal-safe string sanitization;
- grapheme-aware text editing;
- terminal-cell measurement and layout;
- prompts, prompt theming, prompt validation, prompt cancellation, prompt diagnostics, and prompt transcripts;
- password and secret redaction behavior for interactive input;
- line-mode shells;
- command palettes;
- shell history and checkpoint contracts when explicitly configured;
- TUI app state/update/view contracts;
- widget tree, layout, focus, frame, and render-diff contracts;
- accessibility exports;
- interaction transcripts and replay;
- downstream testing harnesses.

### Delegated to `@ismail-elkorchi/cli-core`

`cli-core` owns:

- command definitions;
- command trees;
- command lookup and aliases;
- positionals;
- option binding;
- config resolution;
- help and version documents;
- completion payloads;
- command manifests;
- plugins;
- repair suggestions;
- execution planning and run results;
- effect and artifact envelopes;
- command-core testing helpers.

`terminal-ui` may consume these `cli-core` surfaces, but it must not fork or duplicate them. Shells and command palettes must derive command semantics from `CliProgram`, `CommandManifest`, or explicit `cli-core` adapter inputs.

### Delegated to `argv-flags`

`argv-flags` owns low-level schema-driven flag parsing, stable flag issue codes, machine-readable parse results, parser schema normalization, and JSON-safe parse result conversion.

`terminal-ui` must not implement a parallel argv token parser. When an interactive shell needs command parsing, it must route through `cli-core`, which delegates low-level flag parsing to `argv-flags`.

### Product non-goals

`terminal-ui` must not own:

- low-level flag token parsing;
- command-tree definition;
- semantic command validation;
- config resolution;
- plugin loading semantics outside the shell interaction layer;
- business workflows for a product application;
- browser or web UI rendering;
- process supervision;
- hidden file writes, profile mutation, or persistence without explicit caller policy.

## Runtime model

The core package must be runtime-agnostic. The core state machines, prompt reducers, text layout functions, shell reducers, widget layout, TUI diffing, accessible snapshots, and transcript replay must not depend on Node-only globals.

Runtime-specific behavior belongs in thin host adapters:

- Node host adapter;
- Deno host adapter;
- Bun host adapter;
- memory host adapter for tests;
- optional PTY-style adapter for integration tests when the runtime can support it.

The package must avoid ambient side effects by default. Creating a host may capture explicit runtime streams, but public functions must not read from or write to global stdin/stdout/stderr unless the caller requested a default runtime host.

## Package layout

The implementation repository must use a feature-oriented layout:

```text
src/
  index.ts
  package.ts
  host/
  input/
  protocol/
  text/
  theme/
  prompts/
  shell/
  tui/
  widgets/
  accessibility/
  transcript/
  testing/
  diagnostics.ts
  result.ts
  errors.ts
schemas/
  accessible-snapshot.schema.json
  interaction-transcript.schema.json
  terminal-capabilities.schema.json
  prompt-result.schema.json
  shell-transcript.schema.json
  tui-frame.schema.json
tests/
  unit/
  property/
  acceptance/
  conformance/
  integration/
  security/
  package/
  runtime/
  fixtures/
examples/
  prompts/
  shell/
  tui/
  testing/
docs/
  index.md
  api/
  guides/
  accessibility.md
  security.md
```

Catch-all folders such as `utils`, `helpers`, or `common` must not become owners of product behavior. Shared code must be placed under the feature that owns it or under a named cross-cutting subsystem such as `text`, `protocol`, `accessibility`, `transcript`, or `diagnostics`.

## Public entrypoints

The package must publish these entrypoints:

```json
{
  ".": "./dist/index.js",
  "./host": "./dist/host/index.js",
  "./input": "./dist/input/index.js",
  "./protocol": "./dist/protocol/index.js",
  "./text": "./dist/text/index.js",
  "./theme": "./dist/theme/index.js",
  "./prompts": "./dist/prompts/index.js",
  "./shell": "./dist/shell/index.js",
  "./tui": "./dist/tui/index.js",
  "./widgets": "./dist/widgets/index.js",
  "./accessibility": "./dist/accessibility/index.js",
  "./transcript": "./dist/transcript/index.js",
  "./testing": "./dist/testing/index.js",
  "./schemas": "./dist/schemas/index.js",
  "./schemas/*.json": "./dist/schemas/*.json"
}
```

The JSR package must expose equivalent TypeScript source entrypoints.

## Root API

The root entrypoint exposes the primary vertical path and stable product metadata:

```ts
export const terminalUiPackage: TerminalUiPackage;

export function createTerminalHost(options?: CreateTerminalHostOptions): TerminalHost;
export function createMemoryTerminalHost(options?: MemoryTerminalHostOptions): MemoryTerminalHost;

export function runPrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  host?: TerminalHost
): Promise<PromptResult<TValue>>;

export function createShell(options: ShellOptions): TerminalShell;
export function runShell(shell: TerminalShell, host?: TerminalHost): Promise<ShellExit>;

export function defineTui<TState, TMessage>(
  definition: TuiDefinition<TState, TMessage>
): TuiApp<TState, TMessage>;

export function runTui<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host?: TerminalHost
): Promise<TuiExit<TState>>;
```

Root must re-export the most important public types for consumers who do not need subpath imports.

## Package metadata API

```ts
export interface TerminalUiPackage {
  readonly name: '@ismail-elkorchi/terminal-ui';
  readonly version: string;
  readonly schemaVersion: 'terminal-ui.v1';
  readonly runtimeTargets: readonly RuntimeTarget[];
  readonly entrypoints: readonly TerminalUiEntrypoint[];
}

export type RuntimeTarget = 'node' | 'deno' | 'bun' | 'memory';

export type TerminalUiEntrypoint =
  | 'root'
  | 'host'
  | 'input'
  | 'protocol'
  | 'text'
  | 'theme'
  | 'prompts'
  | 'shell'
  | 'tui'
  | 'widgets'
  | 'accessibility'
  | 'transcript'
  | 'testing'
  | 'schemas';
```

## Result and diagnostic model

Interactive cancellation and recoverable terminal failures must be represented as data, not generic thrown exceptions.

```ts
export type TerminalSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface TerminalDiagnostic {
  readonly code: TerminalDiagnosticCode;
  readonly severity: TerminalSeverity;
  readonly message: string;
  readonly target?: string;
  readonly cause?: unknown;
  readonly hint?: string;
  readonly data?: Record<string, TerminalDiagnosticValue>;
}

export type TerminalDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | readonly TerminalDiagnosticValue[]
  | { readonly [key: string]: TerminalDiagnosticValue };

export type TerminalDiagnosticCode =
  | 'HOST_CAPABILITY_UNAVAILABLE'
  | 'HOST_STREAM_CLOSED'
  | 'HOST_RESTORE_FAILED'
  | 'HOST_PROTOCOL_UNSUPPORTED'
  | 'INPUT_CANCELLED'
  | 'INPUT_INTERRUPTED'
  | 'INPUT_TIMEOUT'
  | 'PROMPT_VALIDATION_FAILED'
  | 'PROMPT_NON_TTY_DENIED'
  | 'PROMPT_EDITOR_UNAVAILABLE'
  | 'PROMPT_DATA_SOURCE_FAILED'
  | 'SHELL_COMMAND_PARSE_FAILED'
  | 'SHELL_COMMAND_VALIDATE_FAILED'
  | 'SHELL_COMMAND_RUN_FAILED'
  | 'TUI_RENDER_FAILED'
  | 'TUI_LAYOUT_FAILED'
  | 'TEXT_UNSAFE_CONTROL_SEQUENCE'
  | 'TRANSCRIPT_REPLAY_FAILED'
  | 'ACCESSIBLE_SNAPSHOT_INVALID';

export type Result<TValue, TError = TerminalDiagnostic> =
  | { readonly ok: true; readonly value: TValue; readonly diagnostics?: readonly TerminalDiagnostic[] }
  | { readonly ok: false; readonly error: TError; readonly diagnostics?: readonly TerminalDiagnostic[] };
```

Thrown exceptions are allowed only for programmer errors that make the API impossible to use safely, such as invalid schema shape, invalid widget definition, or an internally corrupted state invariant. Ordinary user cancellation, unsupported terminal capabilities, non-TTY denial, timeout, validation failure, and replay mismatch must return typed result data.

## Host API

The `/host` entrypoint owns terminal IO boundaries and runtime adapters.

```ts
export function createTerminalHost(options?: CreateTerminalHostOptions): TerminalHost;
export function createNodeTerminalHost(options?: NodeTerminalHostOptions): TerminalHost;
export function createDenoTerminalHost(options?: DenoTerminalHostOptions): TerminalHost;
export function createBunTerminalHost(options?: BunTerminalHostOptions): TerminalHost;
export function createMemoryTerminalHost(options?: MemoryTerminalHostOptions): MemoryTerminalHost;
export function detectTerminalCapabilities(host: TerminalHost): Promise<TerminalCapabilities>;
export function restoreTerminalState(host: TerminalHost): Promise<void>;
```

### Host contract

```ts
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

export interface TerminalInput {
  read(): AsyncIterable<TerminalInputChunk>;
  setRawMode?(enabled: boolean): Promise<void> | void;
  isRawModeEnabled?(): boolean;
  isTty(): boolean;
}

export interface TerminalOutput {
  write(chunk: string | Uint8Array): Promise<void> | void;
  isTty(): boolean;
  columns?: number;
  rows?: number;
}

export interface TerminalSignalSource {
  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe;
}

export interface TerminalClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface TerminalEnvironment {
  get(name: string): string | undefined;
  entries(): Iterable<readonly [string, string]>;
}

export type Unsubscribe = () => void;
```

### Terminal session

```ts
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
```

The host layer must restore terminal state after success, cancellation, interruption, timeout, thrown failure, and disposal. Raw-mode leaks, alternate-screen leaks, bracketed-paste leaks, mouse-reporting leaks, and focus-reporting leaks are release-blocking defects.

### Capabilities

```ts
export interface TerminalCapabilities {
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
```

Optional protocols must be additive. Baseline navigation must not require enhanced keyboard protocols such as Kitty keyboard reporting or CSI-u. Baseline keys must include printable text, arrows, Enter, Escape, Tab, Backspace, Delete, PageUp, PageDown, Home, End, Ctrl+C, and Ctrl+D.

## Input API

The `/input` entrypoint owns normalized event types and input decoding.

```ts
export function decodeInputChunk(chunk: TerminalInputChunk, options?: InputDecodeOptions): readonly InputEvent[];
export function normalizeKeyEvent(event: KeyEventLike): KeyEvent;
export function isCancelKey(event: InputEvent): boolean;
export function isInterruptKey(event: InputEvent): boolean;
```

```ts
export type InputEvent =
  | KeyEvent
  | TextInputEvent
  | PasteEvent
  | MouseEvent
  | ResizeEvent
  | FocusEvent
  | SignalEvent
  | EndOfInputEvent
  | UnknownInputEvent;

export interface KeyEvent {
  readonly kind: 'key';
  readonly key: KeyName;
  readonly sequence?: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly repeat?: boolean;
}

export interface TextInputEvent {
  readonly kind: 'text';
  readonly text: string;
  readonly paste: false;
}

export interface PasteEvent {
  readonly kind: 'paste';
  readonly text: string;
  readonly bracketed: boolean;
}

export interface ResizeEvent {
  readonly kind: 'resize';
  readonly viewport: TerminalViewport;
}

export interface FocusEvent {
  readonly kind: 'focus';
  readonly focused: boolean;
}

export interface EndOfInputEvent {
  readonly kind: 'end';
}

export type KeyName =
  | 'enter'
  | 'escape'
  | 'tab'
  | 'backspace'
  | 'delete'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight'
  | 'pageUp'
  | 'pageDown'
  | 'home'
  | 'end'
  | 'space'
  | 'ctrlC'
  | 'ctrlD'
  | 'unknown';
```

Paste input must be distinguishable from ordinary per-key typing whenever the host can detect bracketed paste.

## Protocol API

The `/protocol` entrypoint owns terminal control sequence generation, parsing helpers, and restoration plans.

```ts
export function createProtocolWriter(host: TerminalHost): TerminalProtocolWriter;
export function createRestorePlan(snapshot: TerminalStateSnapshot): TerminalRestorePlan;
export function sanitizeControlSequence(sequence: string): string;
```

```ts
export interface TerminalProtocolWriter {
  enableAlternateScreen(): Promise<void>;
  disableAlternateScreen(): Promise<void>;
  enableBracketedPaste(): Promise<void>;
  disableBracketedPaste(): Promise<void>;
  enableMouseReporting(mode: MouseReportingMode): Promise<void>;
  disableMouseReporting(): Promise<void>;
  enableFocusReporting(): Promise<void>;
  disableFocusReporting(): Promise<void>;
  hideCursor(): Promise<void>;
  showCursor(): Promise<void>;
  moveCursor(row: number, column: number): Promise<void>;
  clearScreen(): Promise<void>;
  clearLine(): Promise<void>;
  setTitle(title: string): Promise<void>;
  bell(): Promise<void>;
}

export type MouseReportingMode = 'none' | 'click' | 'drag' | 'all';
```

Untrusted text must never be emitted as raw control sequences. Protocol writing APIs must accept only typed operations, not arbitrary user-supplied escape strings.

## Text API

The `/text` entrypoint owns Unicode-aware text segmentation, terminal-cell measurement, clipping, wrapping, editing, and sanitization.

```ts
export function segmentGraphemes(text: string): readonly GraphemeSegment[];
export function measureTextCells(text: string, options?: TextMeasurementOptions): TextCellMetrics;
export function clipTextCells(text: string, maxCells: number, options?: TextClipOptions): TextClipResult;
export function wrapTextCells(text: string, width: number, options?: TextWrapOptions): readonly TextLine[];
export function editTextBuffer(buffer: TextEditBuffer, operation: TextEditOperation): TextEditBuffer;
export function sanitizeTerminalText(text: string, options?: SanitizeTerminalTextOptions): SanitizedTerminalText;
```

```ts
export interface GraphemeSegment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly cells: number;
}

export interface TextCellMetrics {
  readonly text: string;
  readonly graphemes: readonly GraphemeSegment[];
  readonly cells: number;
  readonly codeUnits: number;
  readonly hasControlSequences: boolean;
}

export interface TextLine {
  readonly text: string;
  readonly cells: number;
  readonly hardBreak: boolean;
}

export interface TextEditBuffer {
  readonly text: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
}

export type TextEditOperation =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'deleteBackward' }
  | { readonly kind: 'deleteForward' }
  | { readonly kind: 'moveLeft' }
  | { readonly kind: 'moveRight' }
  | { readonly kind: 'moveHome' }
  | { readonly kind: 'moveEnd' }
  | { readonly kind: 'replaceSelection'; readonly text: string };

export interface SanitizedTerminalText {
  readonly text: string;
  readonly changed: boolean;
  readonly removedControlSequences: readonly RemovedControlSequence[];
}
```

Text layout must respect grapheme clusters and terminal cell width. Cursor-left, cursor-right, deletion, clipping, truncation, selection, and scroll anchoring must operate on grapheme boundaries and measured cell widths, not UTF-16 string length.

If full bidirectional text support is not implemented, the product must expose a documented stable fallback policy that keeps layout and snapshots deterministic.

## Theme API

The `/theme` entrypoint owns styling contracts, not terminal business behavior.

```ts
export const defaultTheme: TerminalTheme;
export function defineTheme(theme: TerminalThemeDefinition): TerminalTheme;
export function mergeThemes(base: TerminalTheme, override: TerminalThemeDefinition): TerminalTheme;
export function renderStyledText(text: StyledText, theme: TerminalTheme, capabilities: TerminalCapabilities): string;
```

```ts
export interface TerminalTheme {
  readonly name: string;
  readonly symbols: TerminalSymbols;
  readonly styles: TerminalStyles;
  readonly spacing: TerminalSpacing;
}

export interface TerminalSymbols {
  readonly pointer: string;
  readonly selected: string;
  readonly unselected: string;
  readonly checked: string;
  readonly unchecked: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
  readonly success: string;
  readonly progressIncomplete: string;
  readonly progressComplete: string;
}

export interface StyledText {
  readonly text: string;
  readonly tone?: 'normal' | 'muted' | 'info' | 'success' | 'warning' | 'error' | 'accent';
  readonly emphasis?: 'normal' | 'bold' | 'italic' | 'underline';
}
```

Themes must degrade cleanly when color is unavailable. Symbols must have ASCII-safe alternatives.

## Prompt API

The `/prompts` entrypoint owns reusable interactive prompts.

```ts
export function runPrompt<TValue>(prompt: PromptDefinition<TValue>, host?: TerminalHost): Promise<PromptResult<TValue>>;
export function confirm(options: ConfirmPromptOptions): PromptDefinition<boolean>;
export function input(options: InputPromptOptions): PromptDefinition<string>;
export function password(options: PasswordPromptOptions): PromptDefinition<string>;
export function select<TValue>(options: SelectPromptOptions<TValue>): PromptDefinition<TValue>;
export function multiselect<TValue>(options: MultiSelectPromptOptions<TValue>): PromptDefinition<readonly TValue[]>;
export function autocomplete<TValue>(options: AutocompletePromptOptions<TValue>): PromptDefinition<TValue>;
export function editor(options: EditorPromptOptions): PromptDefinition<string>;
export function progress(options: ProgressPromptOptions): PromptDefinition<ProgressResult>;
```

### Prompt definition

```ts
export interface PromptDefinition<TValue> {
  readonly kind: PromptKind;
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly defaultValue?: TValue;
  readonly required?: boolean;
  readonly theme?: TerminalThemeDefinition;
  readonly timeoutMs?: number;
  readonly nonTty?: NonTtyPromptPolicy<TValue>;
  readonly validate?: PromptValidator<TValue>;
  readonly render?: PromptRenderer<TValue>;
  readonly accessibility?: PromptAccessibilityOptions;
}

export type PromptKind =
  | 'confirm'
  | 'input'
  | 'password'
  | 'select'
  | 'multiselect'
  | 'autocomplete'
  | 'editor'
  | 'progress';

export type PromptValidator<TValue> = (
  value: TValue,
  context: PromptValidationContext
) => PromptValidationResult | Promise<PromptValidationResult>;

export type PromptValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly code?: string };
```

### Prompt result

```ts
export type PromptResult<TValue> =
  | PromptSubmitResult<TValue>
  | PromptAbortResult;

export interface PromptSubmitResult<TValue> {
  readonly status: 'submitted';
  readonly value: TValue;
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly transcript?: InteractionTranscript;
  readonly snapshot: AccessibleSnapshot;
}

export interface PromptAbortResult {
  readonly status: 'aborted';
  readonly reason: PromptAbortReason;
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly transcript?: InteractionTranscript;
  readonly snapshot?: AccessibleSnapshot;
}

export type PromptAbortReason =
  | 'cancelled'
  | 'interrupted'
  | 'timeout'
  | 'non_tty_denied'
  | 'validation_failed'
  | 'host_error';
```

Ordinary cancellation must not be encoded as a thrown exception.

### Prompt choices and data sources

```ts
export interface PromptChoice<TValue = string> {
  readonly id?: string;
  readonly label: string;
  readonly value: TValue;
  readonly description?: string;
  readonly disabled?: boolean | string;
  readonly keywords?: readonly string[];
}

export type PromptDataSource<TValue> =
  | readonly PromptChoice<TValue>[]
  | ((query: PromptDataSourceQuery) => PromptDataSourceResult<TValue> | Promise<PromptDataSourceResult<TValue>>);

export interface PromptDataSourceQuery {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
  readonly signal: AbortSignal;
}

export interface PromptDataSourceResult<TValue> {
  readonly choices: readonly PromptChoice<TValue>[];
  readonly total?: number;
  readonly hasMore?: boolean;
  readonly diagnostics?: readonly TerminalDiagnostic[];
}
```

Prompt data sources must support loading state, empty state, partial failure diagnostics, disabled entries, incremental pagination, and stale result suppression. Slower async responses must never overwrite newer prompt state.

### Prompt primitives

#### `confirm()`

- Supports yes/no keyboard input, Enter default, explicit default labels, and non-TTY default policy.
- Output value is boolean.
- Must expose accessible role, label, value, focus, and selected state.

#### `input()`

- Supports single-line editing, grapheme-aware cursor movement, validation, defaults, paste, and line fallback in non-TTY mode when configured.
- Must not silently collapse multiline paste unless configured. Multiline input belongs to `editor()`.

#### `password()`

- Supports masked input, secret redaction, validation, paste policy, and cancellation.
- Must never emit the secret value into transcripts, logs, snapshots, diagnostics, rendered frames, or thrown errors by default.

#### `select()`

- Supports single selection from sync or async choices.
- Supports filtering, pagination, disabled choices, descriptions, search, keyboard navigation, and non-TTY rejection or explicit answer policy.

#### `multiselect()`

- Supports toggling choices, range selection when configured, minimum and maximum selected counts, disabled entries, search, pagination, and deterministic ordering.

#### `autocomplete()`

- Supports async query sources, debouncing, cancellation, loading state, empty state, highlighted match rendering, and stale response suppression.

#### `editor()`

- Supports long-form multiline authoring through external editor integration.
- Prefers `VISUAL`, then `EDITOR`, unless the caller provides an explicit editor command.
- Must use explicit spawn/file host APIs supplied by the caller or by a runtime adapter policy.
- If no safe editor exists, must return a typed diagnostic or use an explicitly configured inline fallback.
- Must never silently drop multiline intent into a single-line field.

#### `progress()`

- Supports determinate and indeterminate progress rendering, status updates, cancellation, accessible progress snapshots, and degraded transcript-only mode.
- Must be usable by long-running command handlers without taking ownership of the command semantics.

## Non-TTY behavior

Non-TTY behavior must be deterministic and surface-specific.

```ts
export type NonTtyMode = 'line_fallback' | 'transcript_only' | 'reject' | 'provided_value';

export interface NonTtyPromptPolicy<TValue> {
  readonly mode: NonTtyMode;
  readonly value?: TValue;
  readonly diagnosticHint?: string;
}
```

Default policies:

- `input()`: `line_fallback` when stdin can provide a line, otherwise `reject`.
- `confirm()`: `provided_value` only when the caller provides a default or explicit policy, otherwise `reject`.
- `select()`, `multiselect()`, `autocomplete()`: `reject` unless caller provides an explicit non-TTY contract.
- `editor()`: `reject` unless caller provides a safe fallback.
- `progress()`: `transcript_only`.
- Full-screen TUI: `reject`.
- Shell: `transcript_only` or `reject`, depending on caller policy.

Rejection diagnostics must name the flag, file, manifest, environment variable, or caller-supplied alternative that can provide input non-interactively when known.

## Shell API

The `/shell` entrypoint owns line-mode shells, command palettes, history contracts, command suggestions, and transcript replay around `cli-core` command surfaces.

```ts
export function createShell(options: ShellOptions): TerminalShell;
export function runShell(shell: TerminalShell, host?: TerminalHost): Promise<ShellExit>;
export function createCommandPalette(options: CommandPaletteOptions): CommandPalette;
export function createCliCoreCommandSource(input: CliCoreCommandSourceInput): ShellCommandSource;
```

### Shell integration with `cli-core`

```ts
import type {
  CliProgram,
  CommandManifest,
  ParsedInvocation,
  RunRequest,
  RunResult,
  SemanticValidationResult
} from '@ismail-elkorchi/cli-core';

export type CliCoreCommandSourceInput =
  | { readonly kind: 'program'; readonly program: CliProgram }
  | { readonly kind: 'manifest'; readonly manifest: CommandManifest }
  | { readonly kind: 'adapter'; readonly adapter: CliCoreShellAdapter };

export interface CliCoreShellAdapter {
  describe(): CommandManifest;
  parse(input: ShellCommandParseInput): ParsedInvocation;
  validate?(invocation: ParsedInvocation): Promise<SemanticValidationResult>;
  run?(request: RunRequest): Promise<RunResult>;
}
```

`terminal-ui` must not define a competing command model. It may define shell-facing view models derived from `cli-core` manifests, such as palette entries and suggestions, but those view models are projections, not command truth.

### Shell types

```ts
export interface ShellOptions {
  readonly id?: string;
  readonly title?: string;
  readonly prompt?: string | ShellPromptRenderer;
  readonly commands: ShellCommandSource;
  readonly history?: ShellHistoryProvider;
  readonly checkpoint?: ShellCheckpointPolicy;
  readonly transcript?: TranscriptPolicy;
  readonly theme?: TerminalThemeDefinition;
  readonly nonTty?: ShellNonTtyPolicy;
  readonly runPolicy?: ShellRunPolicy;
  readonly accessibility?: ShellAccessibilityOptions;
}

export interface TerminalShell {
  readonly id: string;
  readonly options: ShellOptions;
  getState(): ShellState;
  dispatch(event: ShellEvent): Promise<ShellState>;
  snapshot(): AccessibleSnapshot;
}

export interface ShellState {
  readonly input: TextEditBuffer;
  readonly mode: ShellMode;
  readonly suggestions: readonly ShellSuggestion[];
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly historyCursor?: number;
  readonly transientLayer?: ShellTransientLayer;
}

export type ShellMode = 'idle' | 'editing' | 'suggesting' | 'running' | 'cancelled' | 'exited';

export interface ShellExit {
  readonly status: 'completed' | 'cancelled' | 'interrupted' | 'error';
  readonly exitCode: number;
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly transcript?: ShellTranscript;
}
```

### Shell behavior

Shells must:

- support grapheme-aware line editing;
- support command suggestions from `cli-core` manifests;
- support command palette navigation;
- support command help preview from `cli-core` help/manifest data;
- support parse and validation diagnostics from `cli-core`;
- support command run results from `cli-core` when a run adapter is supplied;
- support transcript capture when explicitly enabled;
- redact secrets from transcripts by default;
- preserve one-step-back cancellation semantics;
- avoid persistence unless explicit history or checkpoint policies are supplied.

`Esc` dismisses one transient layer at a time. Shell history back or navigation back must remain explicit commands, not hidden side effects of cancellation.

### History and checkpoint contracts

```ts
export interface ShellHistoryProvider {
  read(): Promise<readonly ShellHistoryEntry[]>;
  append(entry: ShellHistoryEntry): Promise<void>;
}

export interface ShellCheckpointPolicy {
  readonly enabled: boolean;
  readonly write: (checkpoint: ShellCheckpoint) => Promise<void>;
  readonly read?: () => Promise<ShellCheckpoint | undefined>;
}
```

The product must not write history files or recovery files unless the caller supplies a history provider or checkpoint policy.

## TUI API

The `/tui` entrypoint owns full-screen terminal UI primitives, app lifecycle, layout, focus, frames, diffs, rendering, and state transitions.

```ts
export function defineTui<TState, TMessage>(definition: TuiDefinition<TState, TMessage>): TuiApp<TState, TMessage>;
export function runTui<TState, TMessage>(app: TuiApp<TState, TMessage>, host?: TerminalHost): Promise<TuiExit<TState>>;
export function renderFrame(frame: Frame, options?: RenderFrameOptions): string;
export function diffFrames(previous: Frame | undefined, next: Frame): RenderDiff;
export function createTuiRuntime<TState, TMessage>(options: TuiRuntimeOptions<TState, TMessage>): TuiRuntime<TState, TMessage>;
```

```ts
export interface TuiDefinition<TState, TMessage> {
  readonly id?: string;
  readonly init: TuiInit<TState, TMessage>;
  readonly update: TuiUpdate<TState, TMessage>;
  readonly view: TuiView<TState, TMessage>;
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly onExit?: TuiExitHandler<TState>;
  readonly accessibility?: TuiAccessibilityOptions<TState>;
}

export interface TuiApp<TState, TMessage> {
  readonly id: string;
  readonly definition: TuiDefinition<TState, TMessage>;
}

export type TuiInit<TState, TMessage> = (context: TuiContext<TState, TMessage>) => TState | Promise<TState>;
export type TuiUpdate<TState, TMessage> = (state: TState, message: TMessage, context: TuiContext<TState, TMessage>) => TuiUpdateResult<TState, TMessage> | Promise<TuiUpdateResult<TState, TMessage>>;
export type TuiView<TState, TMessage> = (state: TState, context: TuiContext<TState, TMessage>) => Widget<TMessage>;

export interface TuiUpdateResult<TState, TMessage> {
  readonly state: TState;
  readonly commands?: readonly TuiCommand<TMessage>[];
  readonly exit?: TuiExitRequest;
}

export interface TuiContext<TState, TMessage> {
  readonly host: TerminalHost;
  readonly viewport: TerminalViewport;
  readonly capabilities: TerminalCapabilities;
  readonly clock: TerminalClock;
  dispatch(message: TMessage): void;
}
```

### TUI behavior

TUI surfaces must:

- use alternate screen only through session-managed protocols;
- restore terminal state on every exit path;
- keep focus explicit, visible, serializable, and restorable;
- keep the terminal cursor aligned with the active focused item when a selectable list is active;
- support compact deterministic chrome;
- prefer recognition-first navigation by default;
- support keyboard-only operation;
- support optional mouse input without changing baseline keyboard semantics;
- emit accessible snapshots;
- emit deterministic transcripts when enabled;
- use diff-based rendering for local changes;
- avoid quadratic reflow or rendering under resize storms, paste bursts, and rapid key repeat.

## Widget API

The `/widgets` entrypoint owns reusable terminal widget primitives.

```ts
export function text(content: string | StyledText, options?: TextWidgetOptions): Widget<never>;
export function box<TMessage>(children: WidgetChildren<TMessage>, options?: BoxWidgetOptions): Widget<TMessage>;
export function stack<TMessage>(children: WidgetChildren<TMessage>, options?: StackWidgetOptions): Widget<TMessage>;
export function row<TMessage>(children: WidgetChildren<TMessage>, options?: RowWidgetOptions): Widget<TMessage>;
export function list<TValue, TMessage>(options: ListWidgetOptions<TValue, TMessage>): Widget<TMessage>;
export function table<TMessage>(options: TableWidgetOptions<TMessage>): Widget<TMessage>;
export function inputField<TMessage>(options: InputFieldWidgetOptions<TMessage>): Widget<TMessage>;
export function statusBar<TMessage>(options: StatusBarWidgetOptions<TMessage>): Widget<TMessage>;
export function progressBar(options: ProgressBarWidgetOptions): Widget<never>;
export function spinner(options?: SpinnerWidgetOptions): Widget<never>;
export function viewport<TMessage>(child: Widget<TMessage>, options: ViewportWidgetOptions): Widget<TMessage>;
```

```ts
export interface Widget<TMessage = unknown> {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly props: WidgetProps;
  readonly children?: readonly Widget<TMessage>[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type WidgetKind =
  | 'text'
  | 'box'
  | 'stack'
  | 'row'
  | 'list'
  | 'table'
  | 'inputField'
  | 'statusBar'
  | 'progressBar'
  | 'spinner'
  | 'viewport'
  | 'custom';
```

Widgets must be pure data descriptions. Widget construction must not write to the terminal, read input, mutate global state, or perform runtime side effects.

## Layout, frame, and render diff API

```ts
export interface LayoutNode {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly bounds: Rect;
  readonly focusable: boolean;
  readonly children: readonly LayoutNode[];
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly FrameCell[];
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility: AccessibleSnapshot;
}

export interface RenderDiff {
  readonly width: number;
  readonly height: number;
  readonly operations: readonly RenderOperation[];
  readonly fullRewrite: boolean;
}

export type RenderOperation =
  | { readonly kind: 'write'; readonly row: number; readonly column: number; readonly text: string }
  | { readonly kind: 'clearLine'; readonly row: number }
  | { readonly kind: 'moveCursor'; readonly row: number; readonly column: number }
  | { readonly kind: 'showCursor'; readonly visible: boolean };
```

Renderers must prefer diffs over full-frame rewrites when only a small region changes. Full rewrites are allowed on initial render, terminal resize, alternate-screen entry, and unrecoverable frame mismatch.

## Accessibility API

The `/accessibility` entrypoint owns machine-readable representations of prompts, shells, and TUI surfaces.

```ts
export function toAccessibleSnapshot(input: AccessibleSnapshotInput): AccessibleSnapshot;
export function validateAccessibleSnapshot(snapshot: AccessibleSnapshot): Result<AccessibleSnapshot>;
export function findAccessibleNode(snapshot: AccessibleSnapshot, id: string): AccessibleNode | undefined;
```

```ts
export interface AccessibleSnapshot {
  readonly schemaVersion: 'terminal-ui.accessible-snapshot.v1';
  readonly source: AccessibleSnapshotSource;
  readonly title?: string;
  readonly root: AccessibleNode;
  readonly focusPath: readonly string[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type AccessibleSnapshotSource = 'prompt' | 'shell' | 'tui' | 'widget' | 'progress';

export interface AccessibleNode {
  readonly id: string;
  readonly role: AccessibleRole;
  readonly label?: string;
  readonly value?: AccessibleValue;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly checked?: boolean | 'mixed';
  readonly progress?: AccessibleProgress;
  readonly description?: string;
  readonly children?: readonly AccessibleNode[];
}

export type AccessibleRole =
  | 'application'
  | 'dialog'
  | 'status'
  | 'progressbar'
  | 'textbox'
  | 'button'
  | 'checkbox'
  | 'radio'
  | 'listbox'
  | 'option'
  | 'menu'
  | 'menuitem'
  | 'table'
  | 'row'
  | 'cell'
  | 'text';
```

Every prompt, shell, and TUI surface must have an accessible export path. Accessible snapshots must include enough state for assistive tooling, deterministic tests, and coding-agent interpretation.

## Transcript API

The `/transcript` entrypoint owns deterministic interaction recordings and replay inputs.

```ts
export function createTranscriptRecorder(options?: TranscriptRecorderOptions): TranscriptRecorder;
export function redactTranscript(transcript: InteractionTranscript, policy?: RedactionPolicy): InteractionTranscript;
export function replayTranscript(harness: TerminalHarness, transcript: InteractionTranscript): Promise<InteractionResult>;
export function validateTranscript(transcript: InteractionTranscript): Result<InteractionTranscript>;
```

```ts
export interface InteractionTranscript {
  readonly schemaVersion: 'terminal-ui.interaction-transcript.v1';
  readonly id: string;
  readonly source: TranscriptSource;
  readonly startedAt?: string;
  readonly steps: readonly InteractionTranscriptStep[];
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly redactions: readonly TranscriptRedaction[];
}

export type TranscriptSource = 'prompt' | 'shell' | 'tui' | 'test' | 'replay';

export type InteractionTranscriptStep =
  | { readonly kind: 'input'; readonly event: InputEvent }
  | { readonly kind: 'frame'; readonly frame: Frame }
  | { readonly kind: 'diff'; readonly diff: RenderDiff }
  | { readonly kind: 'snapshot'; readonly snapshot: AccessibleSnapshot }
  | { readonly kind: 'diagnostic'; readonly diagnostic: TerminalDiagnostic }
  | { readonly kind: 'restore'; readonly checkpoint: TerminalStateSnapshot };
```

Transcript capture must be opt-in. Sensitive prompt responses and masked input must be redacted by default. Replay must reconstruct normalized input events, rendered frames or diffs, focus transitions, accessible snapshots, and terminal-restore checkpoints.

## Testing API

The `/testing` entrypoint must let downstream products test prompts, shells, and TUI apps without private imports.

```ts
export function createTerminalHarness(options?: TerminalHarnessOptions): TerminalHarness;
export function runInteractionScript(harness: TerminalHarness, script: InteractionScript): Promise<InteractionResult>;
export function replayTranscript(harness: TerminalHarness, transcript: InteractionTranscript): Promise<InteractionResult>;
export function toAccessibleSnapshot(harness: TerminalHarness): AccessibleSnapshot;
export function assertFocus(snapshot: AccessibleSnapshot, assertion: FocusAssertion): void;
export function assertNoSecretLeak(result: InteractionResult, secret: string): void;
export function assertTerminalRestored(result: InteractionResult): void;
```

```ts
export interface TerminalHarness {
  readonly host: MemoryTerminalHost;
  readonly clock: ControlledTerminalClock;
  readonly transcript: TranscriptRecorder;
  input(event: InputEvent | string): Promise<void>;
  resize(viewport: TerminalViewport): Promise<void>;
  run<T>(operation: (host: TerminalHost) => Promise<T>): Promise<T>;
  snapshot(): AccessibleSnapshot;
  frames(): readonly Frame[];
  diffs(): readonly RenderDiff[];
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
```

The testing surface must emit frames, diffs, snapshots, normalized events, transcripts, diagnostics, and restore checkpoints.

## Schemas

The `/schemas` entrypoint must expose JSON Schema artifacts for machine-readable payloads:

- terminal capabilities;
- prompt result;
- accessible snapshot;
- interaction transcript;
- shell transcript;
- TUI frame;
- render diff;
- terminal diagnostics.

Every top-level machine-readable document must include a `schemaVersion` field.

## Security requirements

The product must treat terminal interaction as an adversarial boundary.

Required security behavior:

- sanitize untrusted terminal content before display, logging, snapshot export, transcript export, or diagnostics;
- redact password and secret-like values from transcripts, snapshots, logs, frames, diagnostics, and thrown errors by default;
- keep transcript capture opt-in;
- never write shell profiles, history files, checkpoint files, or recovery files without explicit caller policy;
- avoid shell interpolation for editor or process integration; use argv arrays and explicit host policies;
- restore terminal state on all exit paths;
- expose diagnostics for unsupported protocols instead of assuming success;
- avoid leaking control sequences from untrusted labels, choices, command output, and manifest data.

## Performance requirements

The implementation must remain responsive under large data and frequent input.

Required behavior:

- render local changes with diffs instead of full rewrites where possible;
- handle resize storms deterministically;
- handle paste bursts without unbounded per-character re-rendering;
- avoid quadratic layout or render growth under rapid key repeat;
- scale list selection, filtering, pagination, and visible-window movement with visible window size or focused widget set rather than total collection size;
- support virtualization or windowing for large lists;
- avoid blocking the input loop while async prompt sources are loading;
- cancel stale async data source and validation responses.

## Acceptance and conformance suites

The product repository must include executable suite lanes:

- unit tests for local reducers, layout, sanitization, and protocol writers;
- property tests for text segmentation, clipping, sanitization, and render diffs;
- acceptance tests for public prompt, shell, TUI, and testing APIs;
- conformance tests for Node, Deno, and Bun imports/adapters;
- integration tests for runtime terminal adapters where safe;
- security tests for redaction, sanitization, and terminal restore;
- package tests for npm and JSR entrypoints;
- examples tests or doc tests for public documentation;
- benchmark or bounded-cost tests for resize storms, paste bursts, large lists, and repeated local updates.

`npm run check` must include all release-gating lanes. Runtime-specific commands may exist for Node, Deno, Bun, package, shell, and security validation.

## Required fixture families

The repository must maintain deterministic fixtures for:

- `tty-basic`;
- `tty-enhanced`;
- `non-tty`;
- `narrow-viewport`;
- `resize-storm`;
- `ascii-basic`;
- `grapheme-clusters`;
- `east-asian-width`;
- `bidi-fallback`;
- `control-sequence-untrusted`;
- `confirm-prompt`;
- `input-prompt`;
- `password-prompt`;
- `autocomplete-prompt`;
- `select-prompt`;
- `multiselect-prompt`;
- `editor-prompt`;
- `async-data-source-prompt`;
- `disabled-choice-prompt`;
- `validation-lag-prompt`;
- `manifest-shell`;
- `command-palette`;
- `focus-list`;
- `progress-screen`;
- `compact-chrome-screen`;
- `large-collection-screen`;
- `unsaved-editor-state`;
- `mouse-report-flood`;
- `paste-burst`;
- `interrupted-editor`;
- `non-tty-denial`.

## Documentation requirements

The product repository must publish documentation for:

- installation on npm and JSR;
- runtime support and limits;
- prompt examples;
- shell examples using `cli-core`;
- TUI examples;
- widgets guide;
- host adapter guide;
- accessibility guide;
- transcript and replay guide;
- non-TTY behavior guide;
- security and redaction guide;
- testing harness guide;
- migration notes from common prompt/TUI libraries without promising drop-in compatibility.

Documentation examples must compile or run in docs tests.

## Release gates

A release candidate must not ship unless:

- root and every subpath entrypoint load in Node, Deno, and Bun checks;
- TypeScript declarations match the documented API;
- all public machine-readable documents validate against shipped schemas;
- prompt results use typed cancellation and do not throw for ordinary aborts;
- non-TTY behavior is deterministic and documented;
- terminal restore tests pass for success, cancellation, interruption, timeout, and thrown failure;
- secret redaction tests prove masked values do not leak;
- untrusted terminal text sanitization tests pass;
- Unicode layout snapshots pass for approved grapheme and East Asian width corpora;
- shell command surfaces derive from `cli-core` inputs;
- no low-level argv parser exists in this package;
- transcript replay is deterministic for approved fixtures;
- accessible snapshots include required roles, labels, values, focus, selected, disabled, expanded, checked, and progress state where applicable;
- render-diff tests prove local updates avoid full rewrites when possible;
- large-list and input-storm tests meet bounded-cost expectations;
- docs examples and package smoke tests pass.

## Implementation notes for Codex and other coding agents

When implementing this product, read this file as the product contract.

Do not implement workbench infrastructure in the product repository. Do not create evidence packs, signal records, cluster records, private transfer files, or portfolio coordination files. Do not add internal workbench paths to package docs, source code, diagnostics, examples, tests, schemas, or generated artifacts.

Build the feature-complete product described here. The implementation can be split into pull requests, but no public API should be designed as a temporary MVP-only shape. Where sequencing is needed, preserve the final contract and add unimplemented behavior behind explicit diagnostics or tracked tests rather than inventing incompatible interim names.
