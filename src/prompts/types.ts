import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TerminalThemeDefinition } from '../theme/index.ts';
import type { InteractionTranscript, TranscriptPolicy } from '../transcript/index.ts';

interface PromptDefinitionBase<TValue> {
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
  readonly render?: PromptRenderer;
  readonly accessibility?: PromptAccessibilityOptions;
}

export interface ConfirmPromptDefinition extends PromptDefinitionBase<boolean> {
  readonly kind: 'confirm';
}

export interface InputPromptDefinition extends PromptDefinitionBase<string> {
  readonly kind: 'input';
}

export interface PasswordPromptDefinition extends PromptDefinitionBase<string> {
  readonly kind: 'password';
  readonly mask?: string;
}

export interface SelectPromptDefinition<TValue> extends PromptDefinitionBase<TValue> {
  readonly kind: 'select';
  readonly choices: PromptDataSource<TValue>;
}

export interface MultiSelectPromptDefinition<TValue> extends PromptDefinitionBase<readonly TValue[]> {
  readonly kind: 'multiselect';
  readonly choices: PromptDataSource<TValue>;
  readonly minSelected?: number;
  readonly maxSelected?: number;
  readonly rangeSelection?: boolean;
}

export interface AutocompletePromptDefinition<TValue> extends PromptDefinitionBase<TValue> {
  readonly kind: 'autocomplete';
  readonly choices: PromptDataSource<TValue>;
  readonly debounceMs?: number;
}

export interface EditorPromptDefinition extends PromptDefinitionBase<string> {
  readonly kind: 'editor';
  readonly editorCommand?: readonly string[];
  readonly editorAdapter?: PromptEditorAdapter;
}

export interface ProgressPromptDefinition extends PromptDefinitionBase<ProgressResult> {
  readonly kind: 'progress';
  readonly progress: ProgressSnapshot;
  readonly progressTask?: ProgressTask;
}

export type PromptDefinition<TChoice = never> =
  | ConfirmPromptDefinition
  | InputPromptDefinition
  | PasswordPromptDefinition
  | SelectPromptDefinition<TChoice>
  | MultiSelectPromptDefinition<TChoice>
  | AutocompletePromptDefinition<TChoice>
  | EditorPromptDefinition
  | ProgressPromptDefinition;

export type ChoicePromptDefinition<TValue = unknown> =
  | SelectPromptDefinition<TValue>
  | MultiSelectPromptDefinition<TValue>
  | AutocompletePromptDefinition<TValue>;

export type TextPromptDefinition = InputPromptDefinition | PasswordPromptDefinition;

export type InteractivePromptDefinition<TChoice = never> =
  | ConfirmPromptDefinition
  | TextPromptDefinition
  | ChoicePromptDefinition<TChoice>;

export type PromptValue<TPrompt> =
  TPrompt extends PromptDefinitionBase<infer TValue> ? TValue : never;

export type PromptKind =
  | 'confirm'
  | 'input'
  | 'password'
  | 'select'
  | 'multiselect'
  | 'autocomplete'
  | 'editor'
  | 'progress';

export interface PromptValueContract<TValue> {
  readonly kind: PromptKind;
  readonly required?: boolean;
  readonly validate?: PromptValidator<TValue>;
}

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

export type NonTtyPromptPolicy<TValue> =
  | {
      readonly mode: 'line_fallback' | 'transcript_only' | 'reject';
      readonly value?: never;
      readonly diagnosticHint?: string;
    }
  | {
      readonly mode: 'provided_value';
      readonly value: TValue;
      readonly diagnosticHint?: string;
    };

export interface PromptRenderer {
  render<TChoice>(prompt: PromptDefinition<TChoice>): string;
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
  readonly render?: PromptRenderer;
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
  readonly prompt: EditorPromptDefinition;
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
  readonly progress: ProgressSnapshot;
  readonly task?: ProgressTask;
}

interface ProgressCommon {
  readonly status?: string;
}

export interface DeterminateProgress extends ProgressCommon {
  readonly kind: 'determinate';
  readonly value: number;
  readonly max: number;
}

export interface IndeterminateProgress extends ProgressCommon {
  readonly kind: 'indeterminate';
  readonly frame?: number;
}

export type ProgressSnapshot = DeterminateProgress | IndeterminateProgress;

export interface ProgressResult {
  readonly completed: boolean;
}

export interface ProgressController {
  readonly signal: AbortSignal;
  update(next: ProgressSnapshot): Promise<ProgressState>;
  snapshot(): AccessibleSnapshot;
}

export type ProgressTask = (
  controller: ProgressController
) => ProgressResult | undefined | Promise<ProgressResult | undefined>;

export type ProgressOptions = {
  readonly id?: string;
  readonly label: string;
} & ProgressSnapshot;

export type ProgressState = {
  readonly id: string;
  readonly label: string;
  update(next: ProgressSnapshot): ProgressState;
  snapshot(): AccessibleSnapshot;
} & ProgressSnapshot;
