import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TerminalThemeDefinition } from '../theme/index.ts';
import type { InteractionTranscript, TranscriptPolicy } from '../transcript/index.ts';

export interface PromptDefinition<TValue> {
  readonly kind: PromptKind;
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly mask?: string;
  readonly progress?: PromptProgressState;
  readonly progressTask?: ProgressTask;
  readonly choices?: PromptDataSource<unknown>;
  readonly defaultValue?: TValue;
  readonly minSelected?: number;
  readonly maxSelected?: number;
  readonly rangeSelection?: boolean;
  readonly editorCommand?: readonly string[];
  readonly editorAdapter?: PromptEditorAdapter;
  readonly debounceMs?: number;
  readonly required?: boolean;
  readonly theme?: TerminalThemeDefinition;
  readonly timeoutMs?: number;
  readonly nonTty?: NonTtyPromptPolicy<TValue>;
  readonly transcript?: TranscriptPolicy;
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

export interface PromptValidationContext {
  readonly host?: TerminalHost;
  readonly signal?: AbortSignal;
}

export type PromptValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly code?: string };

export type PromptResult<TValue> = PromptSubmitResult<TValue> | PromptAbortResult;

export interface PromptSubmitResult<TValue> {
  readonly schemaVersion: 'terminal-ui.prompt-result.v1';
  readonly status: 'submitted';
  readonly value: TValue;
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly transcript?: InteractionTranscript;
  readonly snapshot: AccessibleSnapshot;
}

export interface PromptAbortResult {
  readonly schemaVersion: 'terminal-ui.prompt-result.v1';
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

export type NonTtyMode = 'line_fallback' | 'transcript_only' | 'reject' | 'provided_value';

export interface NonTtyPromptPolicy<TValue> {
  readonly mode: NonTtyMode;
  readonly value?: TValue;
  readonly diagnosticHint?: string;
}

export interface PromptRenderer<TValue> {
  render(prompt: PromptDefinition<TValue>): string;
}

export interface PromptAccessibilityOptions {
  readonly id?: string;
}

export interface BasePromptOptions<TValue> {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly defaultValue?: TValue;
  readonly required?: boolean;
  readonly theme?: TerminalThemeDefinition;
  readonly timeoutMs?: number;
  readonly nonTty?: NonTtyPromptPolicy<TValue>;
  readonly transcript?: TranscriptPolicy;
  readonly validate?: PromptValidator<TValue>;
  readonly render?: PromptRenderer<TValue>;
  readonly accessibility?: PromptAccessibilityOptions;
}

export type ConfirmPromptOptions = BasePromptOptions<boolean>;
export type InputPromptOptions = BasePromptOptions<string>;

export interface PasswordPromptOptions extends BasePromptOptions<string> {
  readonly mask?: string;
}

export interface SelectPromptOptions<TValue> extends BasePromptOptions<TValue> {
  readonly choices: PromptDataSource<TValue>;
}

export interface MultiSelectPromptOptions<TValue> extends BasePromptOptions<readonly TValue[]> {
  readonly choices: PromptDataSource<TValue>;
  readonly minSelected?: number;
  readonly maxSelected?: number;
  readonly rangeSelection?: boolean;
}

export interface AutocompletePromptOptions<TValue> extends BasePromptOptions<TValue> {
  readonly choices: PromptDataSource<TValue>;
  readonly debounceMs?: number;
}

export interface EditorPromptOptions extends BasePromptOptions<string> {
  readonly editorCommand?: readonly string[];
  readonly editorAdapter?: PromptEditorAdapter;
}

export type PromptEditorCommandSource = 'option' | 'VISUAL' | 'EDITOR';

export interface PromptEditorCommand {
  readonly source: PromptEditorCommandSource;
  readonly argv: readonly string[];
}

export interface PromptEditorRequest {
  readonly prompt: PromptDefinition<string>;
  readonly initialValue: string;
  readonly command: PromptEditorCommand;
  readonly host?: TerminalHost;
  readonly signal: AbortSignal;
}

export type PromptEditorResult =
  | {
      readonly status: 'submitted';
      readonly value: string;
      readonly diagnostics?: readonly TerminalDiagnostic[];
    }
  | {
      readonly status: 'cancelled' | 'interrupted' | 'unavailable' | 'failed';
      readonly diagnostics?: readonly TerminalDiagnostic[];
    };

export interface PromptEditorAdapter {
  edit(request: PromptEditorRequest): Promise<PromptEditorResult>;
}

export interface ProgressPromptOptions extends Omit<BasePromptOptions<ProgressResult>, 'defaultValue'> {
  readonly value?: number;
  readonly max?: number;
  readonly status?: string;
  readonly indeterminate?: boolean;
  readonly task?: ProgressTask;
}

export interface PromptProgressState {
  readonly value?: number;
  readonly max?: number;
  readonly status?: string;
  readonly indeterminate?: boolean;
}

export interface ProgressResult {
  readonly completed: boolean;
}

export interface ProgressController {
  readonly signal: AbortSignal;
  update(next: ProgressUpdate): Promise<ProgressState>;
  snapshot(): AccessibleSnapshot;
}

export type ProgressUpdate = Partial<Omit<ProgressOptions, 'id' | 'label'>>;

export type ProgressTask = (
  controller: ProgressController
) => ProgressResult | undefined | Promise<ProgressResult | undefined>;

export interface ProgressOptions {
  readonly id?: string;
  readonly label: string;
  readonly value?: number;
  readonly max?: number;
  readonly status?: string;
  readonly indeterminate?: boolean;
}

export interface ProgressState {
  readonly id: string;
  readonly label: string;
  readonly value?: number;
  readonly max?: number;
  readonly status?: string;
  readonly indeterminate: boolean;
  update(next: Partial<Omit<ProgressOptions, 'id' | 'label'>>): ProgressState;
  snapshot(): AccessibleSnapshot;
}
