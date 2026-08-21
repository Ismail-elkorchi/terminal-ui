import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { InteractionTranscript } from '../transcript/index.ts';

declare const promptDefinitionBrand: unique symbol;

interface PromptDefinitionBase<TValue> {
  readonly [promptDefinitionBrand]: true;
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly timeoutMs?: number;
  readonly nonTty?: NonTtyPromptPolicy<TValue>;
  readonly accessibility?: PromptAccessibilityOptions;
}

interface ValuePromptDefinitionBase<TValue> extends PromptDefinitionBase<TValue> {
  readonly defaultValue?: TValue;
  readonly required?: boolean;
  readonly theme?: TerminalTheme;
  readonly transcript?: boolean;
  readonly validate?: PromptValidator<TValue>;
}

export interface ConfirmPromptDefinition extends ValuePromptDefinitionBase<boolean> {
  readonly kind: 'confirm';
}

export interface InputPromptDefinition extends ValuePromptDefinitionBase<string> {
  readonly kind: 'input';
}

export interface PasswordPromptDefinition extends ValuePromptDefinitionBase<string> {
  readonly kind: 'password';
  readonly mask?: string;
}

export interface SelectPromptDefinition<TValue> extends ValuePromptDefinitionBase<TValue> {
  readonly kind: 'select';
  readonly choices: PromptDataSource<TValue>;
}

export interface MultiSelectPromptDefinition<TValue> extends ValuePromptDefinitionBase<readonly TValue[]> {
  readonly kind: 'multiselect';
  readonly choices: PromptDataSource<TValue>;
  readonly minSelected?: number;
  readonly maxSelected?: number;
  readonly rangeSelection?: boolean;
}

export interface AutocompletePromptDefinition<TValue> extends ValuePromptDefinitionBase<TValue> {
  readonly kind: 'autocomplete';
  readonly choices: PromptDataSource<TValue>;
  readonly debounceMs?: number;
}

export interface EditorPromptDefinition extends PromptDefinitionBase<string> {
  readonly kind: 'editor';
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly validate?: PromptValidator<string>;
  readonly editorCommand?: readonly string[];
  readonly editorAdapter?: PromptEditorAdapter;
}

export interface ProgressPromptDefinition extends PromptDefinitionBase<ProgressResult> {
  readonly kind: 'progress';
  readonly transcript?: boolean;
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

export type PromptKind = PromptDefinition<unknown>['kind'];

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
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly message: string; readonly code?: string };

export type PromptResult<TValue> = PromptSubmitResult<TValue> | PromptAbortResult;

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

export interface PromptAccessibilityOptions {
  readonly id?: string;
}

export interface BasePromptOptions<TValue> {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly timeoutMs?: number;
  readonly nonTty?: NonTtyPromptPolicy<TValue>;
  readonly accessibility?: PromptAccessibilityOptions;
}

export interface ValuePromptOptions<TValue> extends BasePromptOptions<TValue> {
  readonly defaultValue?: TValue;
  readonly required?: boolean;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly transcript?: boolean;
  readonly validate?: PromptValidator<TValue>;
}

export type ConfirmPromptOptions = ValuePromptOptions<boolean>;
export type InputPromptOptions = ValuePromptOptions<string>;

export interface PasswordPromptOptions extends ValuePromptOptions<string> {
  readonly mask?: string;
}

export interface SelectPromptOptions<TValue> extends ValuePromptOptions<TValue> {
  readonly choices: PromptDataSource<TValue>;
}

export interface MultiSelectPromptOptions<TValue> extends ValuePromptOptions<readonly TValue[]> {
  readonly choices: PromptDataSource<TValue>;
  readonly minSelected?: number;
  readonly maxSelected?: number;
  readonly rangeSelection?: boolean;
}

export interface AutocompletePromptOptions<TValue> extends ValuePromptOptions<TValue> {
  readonly choices: PromptDataSource<TValue>;
  readonly debounceMs?: number;
}

export interface EditorPromptOptions extends BasePromptOptions<string> {
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly validate?: PromptValidator<string>;
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

export interface ProgressPromptOptions extends BasePromptOptions<ProgressResult> {
  readonly transcript?: boolean;
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
