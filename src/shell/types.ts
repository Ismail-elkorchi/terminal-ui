import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { Result } from '../result.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { TerminalThemeDefinition } from '../theme/index.ts';
import type {
  CliProgram,
  CommandManifest,
  ParsedInvocation,
  RunRequest,
  RunResult,
  SemanticValidationResult
} from '@ismail-elkorchi/cli-core';
import type { TranscriptPolicy } from '../transcript/index.ts';

export type { TranscriptPolicy } from '../transcript/index.ts';

export type ShellCommandSource =
  | {
      readonly kind: 'program';
      readonly program: CliProgram;
      readonly parseArgv: ShellArgvParser;
      readonly run?: ShellProgramRunOptions;
    }
  | { readonly kind: 'manifest'; readonly manifest: CommandManifest }
  | { readonly kind: 'adapter'; readonly adapter: CliCoreShellAdapter };

export type CliCoreCommandSourceInput =
  | {
      readonly kind: 'program';
      readonly program: CliProgram;
      readonly parseArgv: ShellArgvParser;
      readonly run?: ShellProgramRunOptions;
    }
  | { readonly kind: 'manifest'; readonly manifest: CommandManifest }
  | { readonly kind: 'adapter'; readonly adapter: CliCoreShellAdapter };

export type ShellArgvParser = (input: ShellCommandParseInput) => Result<readonly string[]>;

export interface CliCoreShellAdapter {
  describe(): CommandManifest;
  parse(input: ShellCommandParseInput): Result<ParsedInvocation>;
  validate?(invocation: ParsedInvocation): Promise<SemanticValidationResult>;
  run?(request: ShellRunRequest): Promise<RunResult>;
}

export interface ShellCommandParseInput {
  readonly input: string;
}

export interface ShellRunRequest {
  readonly input: string;
  readonly invocation: ParsedInvocation;
  readonly validation?: SemanticValidationResult;
}

export interface ShellProgramRunOptions {
  readonly request?: Omit<RunRequest, 'argv' | 'invocation' | 'validation'>;
}

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

export type ShellPromptRenderer = (state: ShellState) => string;

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
  readonly lastCommand?: ShellTranscriptCommand;
}

export type ShellMode = 'idle' | 'editing' | 'suggesting' | 'running' | 'cancelled' | 'exited';

export interface ShellExit {
  readonly status: 'completed' | 'cancelled' | 'interrupted' | 'error';
  readonly exitCode: number;
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly transcript?: ShellTranscript;
  readonly snapshot: AccessibleSnapshot;
}

export interface ShellTranscript {
  readonly schemaVersion: 'terminal-ui.shell-transcript.v1';
  readonly id: string;
  readonly startedAt?: string;
  readonly commands: readonly ShellTranscriptCommand[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export interface ShellTranscriptCommand {
  readonly input: string;
  readonly argv?: readonly string[];
  readonly status: ShellTranscriptCommandStatus;
  readonly exitCode?: number;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type ShellTranscriptCommandStatus =
  | 'parsed'
  | 'validated'
  | 'completed'
  | 'failed'
  | 'skipped';

export type ShellEvent =
  | { readonly kind: 'input'; readonly text: string }
  | { readonly kind: 'submit' }
  | { readonly kind: 'history'; readonly direction: 'previous' | 'next' }
  | { readonly kind: 'palette'; readonly action: ShellPaletteAction }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'exit' }
  | { readonly kind: 'diagnostic'; readonly diagnostic: TerminalDiagnostic };

export type ShellPaletteAction = 'open' | 'close' | 'next' | 'previous' | 'accept' | 'help';

export interface ShellSuggestion {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly usage?: string;
  readonly aliases?: readonly string[];
  readonly help?: string;
}

export type ShellTransientLayer =
  | { readonly kind: 'suggestions'; readonly selectedIndex: number }
  | { readonly kind: 'palette'; readonly selectedIndex: number }
  | {
      readonly kind: 'help';
      readonly selectedIndex: number;
      readonly returnTo: 'suggestions' | 'palette';
      readonly preview: ShellHelpPreview;
    };

export interface ShellHelpPreview {
  readonly title: string;
  readonly description?: string;
  readonly usage?: string;
  readonly aliases?: readonly string[];
  readonly help?: string;
}

export interface ShellHistoryEntry {
  readonly input: string;
  readonly timestamp?: string;
}

export interface ShellHistoryProvider {
  read(): Promise<readonly ShellHistoryEntry[]>;
  append(entry: ShellHistoryEntry): Promise<void>;
}

export interface ShellCheckpoint {
  readonly input: string;
  readonly state?: unknown;
}

export interface ShellCheckpointPolicy {
  readonly enabled: boolean;
  readonly write: (checkpoint: ShellCheckpoint) => Promise<void>;
  readonly read?: () => Promise<ShellCheckpoint | undefined>;
}

export interface ShellNonTtyPolicy {
  readonly mode: 'transcript_only' | 'reject';
  readonly diagnosticHint?: string;
}

export interface ShellRunPolicy {
  readonly allowRun?: boolean;
}

export interface ShellAccessibilityOptions {
  readonly label?: string;
}

export interface CommandPaletteOptions {
  readonly id?: string;
  readonly title?: string;
  readonly commands: ShellCommandSource;
}

export interface CommandPalette {
  readonly id: string;
  readonly source: ShellCommandSource;
  snapshot(): AccessibleSnapshot;
}

export interface ShellRuntimeOptions {
  readonly shell: TerminalShell;
  readonly host?: TerminalHost;
}
