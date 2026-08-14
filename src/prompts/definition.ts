import type {
  AutocompletePromptOptions,
  BasePromptOptions,
  AutocompletePromptDefinition,
  ConfirmPromptDefinition,
  ConfirmPromptOptions,
  EditorPromptOptions,
  EditorPromptDefinition,
  InputPromptDefinition,
  InputPromptOptions,
  MultiSelectPromptOptions,
  PasswordPromptOptions,
  MultiSelectPromptDefinition,
  PasswordPromptDefinition,
  ProgressPromptDefinition,
  ProgressPromptOptions,
  SelectPromptDefinition,
  SelectPromptOptions
} from './types.ts';
import { minimalTheme } from '../theme/index.ts';
import { resolveThemeInput } from '../theme/theme.ts';
import { adoptTerminalDiagnostic } from '../diagnostics.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import { measureTextCells, sanitizeTerminalCellText, sanitizeTerminalText } from '../text/index.ts';
import { prepareProgressSnapshot } from './progress.ts';
import type {
  PromptChoice,
  PromptDataSource,
  PromptDataSourceQuery,
  PromptDataSourceResult,
  PromptRenderer,
  PromptValidator,
} from './types.ts';

const preparedPromptDefinitions = new WeakSet<object>();

export function confirm(options: ConfirmPromptOptions): ConfirmPromptDefinition;
export function confirm(options: unknown): ConfirmPromptDefinition {
  const supplied = promptOptions(options);
  const defaultValue = supplied['defaultValue'];
  if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
    throw new TypeError('Confirm prompt defaultValue must be a boolean when provided.');
  }
  return registerPrompt(Object.freeze({ kind: 'confirm', ...promptDefinition(supplied) }) as ConfirmPromptDefinition);
}

export function input(options: InputPromptOptions): InputPromptDefinition;
export function input(options: unknown): InputPromptDefinition {
  const supplied = promptOptions(options);
  assertOptionalString(supplied['defaultValue'], 'Input prompt defaultValue');
  return registerPrompt(Object.freeze({ kind: 'input', ...promptDefinition(supplied) }) as InputPromptDefinition);
}

export function password(options: PasswordPromptOptions): PasswordPromptDefinition;
export function password(options: unknown): PasswordPromptDefinition {
  const supplied = promptOptions(options);
  assertOptionalString(supplied['defaultValue'], 'Password prompt defaultValue');
  const mask = prepareMask(supplied['mask']);
  return registerPrompt(Object.freeze({
    kind: 'password',
    ...promptDefinition(supplied),
    ...(mask === undefined ? {} : { mask })
  }) as PasswordPromptDefinition);
}

export function select<TValue>(options: SelectPromptOptions<TValue>): SelectPromptDefinition<TValue>;
export function select<TValue>(options: unknown): SelectPromptDefinition<TValue> {
  const supplied = promptOptions(options);
  return registerPrompt(Object.freeze({
    kind: 'select',
    ...promptDefinition<TValue>(supplied),
    choices: prepareChoiceSource<TValue>(supplied['choices']),
  }) as SelectPromptDefinition<TValue>);
}

export function multiselect<TValue>(
  options: MultiSelectPromptOptions<TValue>
): MultiSelectPromptDefinition<TValue>;
export function multiselect<TValue>(options: unknown): MultiSelectPromptDefinition<TValue> {
  const supplied = promptOptions(options);
  const minSelected = optionalNonNegativeSafeInteger(supplied['minSelected'], 'Multiselect minSelected');
  const maxSelected = optionalNonNegativeSafeInteger(supplied['maxSelected'], 'Multiselect maxSelected');
  if (minSelected !== undefined && maxSelected !== undefined && minSelected > maxSelected) {
    throw new RangeError('Multiselect minSelected cannot exceed maxSelected.');
  }
  const rangeSelection = supplied['rangeSelection'];
  if (rangeSelection !== undefined && typeof rangeSelection !== 'boolean') {
    throw new TypeError('Multiselect rangeSelection must be a boolean when provided.');
  }
  const defaultValue = supplied['defaultValue'];
  const owned = defaultValue === undefined
    ? supplied
    : { ...supplied, defaultValue: Object.freeze(assertArray(defaultValue, 'Multiselect defaultValue').slice()) };
  return registerPrompt(Object.freeze({
    kind: 'multiselect',
    ...promptDefinition<readonly TValue[]>(owned),
    choices: prepareChoiceSource<TValue>(supplied['choices']),
    ...(minSelected === undefined ? {} : { minSelected }),
    ...(maxSelected === undefined ? {} : { maxSelected }),
    ...(rangeSelection === undefined ? {} : { rangeSelection })
  }) as MultiSelectPromptDefinition<TValue>);
}

export function autocomplete<TValue>(
  options: AutocompletePromptOptions<TValue>
): AutocompletePromptDefinition<TValue>;
export function autocomplete<TValue>(options: unknown): AutocompletePromptDefinition<TValue> {
  const supplied = promptOptions(options);
  const debounceMs = optionalNonNegativeSafeInteger(supplied['debounceMs'], 'Autocomplete debounceMs');
  return registerPrompt(Object.freeze({
    kind: 'autocomplete',
    ...promptDefinition<TValue>(supplied),
    choices: prepareChoiceSource<TValue>(supplied['choices']),
    ...(debounceMs === undefined ? {} : { debounceMs })
  }) as AutocompletePromptDefinition<TValue>);
}

export function editor(options: EditorPromptOptions): EditorPromptDefinition;
export function editor(options: unknown): EditorPromptDefinition {
  const supplied = promptOptions(options);
  assertOptionalString(supplied['defaultValue'], 'Editor prompt defaultValue');
  const editorCommand = prepareEditorCommand(supplied['editorCommand']);
  const editorAdapter = supplied['editorAdapter'];
  if (editorAdapter !== undefined && (!isNonArrayObject(editorAdapter) || typeof editorAdapter['edit'] !== 'function')) {
    throw new TypeError('Editor prompt editorAdapter must provide an edit() function.');
  }
  return registerPrompt(Object.freeze({
    kind: 'editor',
    ...promptDefinition(supplied),
    ...(editorCommand === undefined ? {} : { editorCommand }),
    ...(editorAdapter === undefined ? {} : { editorAdapter })
  }) as unknown as EditorPromptDefinition);
}

export function progress(options: ProgressPromptOptions): ProgressPromptDefinition;
export function progress(options: unknown): ProgressPromptDefinition {
  const supplied = promptOptions(options);
  const task = supplied['task'];
  if (task !== undefined && typeof task !== 'function') {
    throw new TypeError('Progress prompt task must be a function when provided.');
  }
  return registerPrompt(Object.freeze({
    kind: 'progress',
    ...promptDefinition({
      ...supplied,
      defaultValue: { completed: false },
      nonTty: supplied['nonTty'] ?? { mode: 'transcript_only' }
    }),
    ...(task === undefined ? {} : { progressTask: task }),
    progress: prepareProgressSnapshot(supplied['progress'])
  }) as ProgressPromptDefinition);
}

function promptDefinition<TValue>(
  options: Readonly<Record<string, unknown>>
): Omit<BasePromptOptions<TValue>, 'id'> & { readonly id?: string } {
  const id = optionalNonEmptyText(options['id'], 'Prompt id');
  const label = requiredNonEmptyText(options['label'], 'Prompt label');
  const description = optionalText(options['description'], 'Prompt description');
  const required = options['required'];
  if (required !== undefined && typeof required !== 'boolean') {
    throw new TypeError('Prompt required must be a boolean when provided.');
  }
  const timeoutMs = optionalPositiveSafeInteger(options['timeoutMs'], 'Prompt timeoutMs');
  const transcript = options['transcript'];
  if (transcript !== undefined && typeof transcript !== 'boolean') {
    throw new TypeError('Prompt transcript must be a boolean when provided.');
  }
  const validate = options['validate'];
  if (validate !== undefined && typeof validate !== 'function') {
    throw new TypeError('Prompt validate must be a function when provided.');
  }
  const render = prepareRenderer(options['render']);
  const accessibility = prepareAccessibility(options['accessibility']);
  const nonTty = prepareNonTtyPolicy<TValue>(options['nonTty']);
  return {
    ...(id === undefined ? {} : { id }),
    label,
    ...(description === undefined ? {} : { description }),
    ...(options['defaultValue'] === undefined ? {} : { defaultValue: options['defaultValue'] as TValue }),
    ...(required === undefined ? {} : { required }),
    ...(options['theme'] === undefined ? {} : { theme: resolveThemeInput(options['theme'], minimalTheme) }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(nonTty === undefined ? {} : { nonTty }),
    ...(transcript === undefined ? {} : { transcript }),
    ...(validate === undefined ? {} : { validate: validate as PromptValidator<TValue> }),
    ...(render === undefined ? {} : { render }),
    ...(accessibility === undefined ? {} : { accessibility })
  };
}

export function assertPromptDefinition(value: unknown): void {
  if (!preparedPromptDefinitions.has(value as object)) {
    throw new TypeError('Prompt definition must be created by a prompt factory.');
  }
}

function registerPrompt<TPrompt extends object>(prompt: TPrompt): TPrompt {
  preparedPromptDefinitions.add(prompt);
  return prompt;
}

function promptOptions(value: unknown): Readonly<Record<string, unknown>> {
  if (!isNonArrayObject(value)) throw new TypeError('Prompt options must be an object.');
  return value;
}

function requiredNonEmptyText(value: unknown, subject: string): string {
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  const text = sanitizeTerminalText(value).text;
  if (text.trim().length === 0) throw new TypeError(`${subject} must not be empty.`);
  return text;
}

function optionalNonEmptyText(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : requiredNonEmptyText(value, subject);
}

function optionalText(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string when provided.`);
  return sanitizeTerminalText(value).text;
}

function assertOptionalString(value: unknown, subject: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new TypeError(`${subject} must be a string when provided.`);
  }
}

function optionalPositiveSafeInteger(value: unknown, subject: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
  return value as number;
}

function optionalNonNegativeSafeInteger(value: unknown, subject: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${subject} must be a non-negative safe integer.`);
  }
  return value as number;
}

function assertArray(value: unknown, subject: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${subject} must be an array.`);
  return value;
}

function prepareMask(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError('Password prompt mask must be a string.');
  const mask = sanitizeTerminalCellText(value).text;
  const measured = measureTextCells(mask);
  if (measured.graphemes.length !== 1 || measured.cells !== 1) {
    throw new TypeError('Password prompt mask must be exactly one terminal cell.');
  }
  return mask;
}

function prepareRenderer(value: unknown): PromptRenderer | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value) || typeof value['render'] !== 'function') {
    throw new TypeError('Prompt renderer must provide a render() function.');
  }
  return value as unknown as PromptRenderer;
}

function prepareAccessibility(value: unknown): { readonly id?: string } | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('Prompt accessibility must be an object.');
  const id = optionalNonEmptyText(value['id'], 'Prompt accessibility id');
  return Object.freeze(id === undefined ? {} : { id });
}

function prepareNonTtyPolicy<TValue>(value: unknown): BasePromptOptions<TValue>['nonTty'] {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('Prompt nonTty policy must be an object.');
  const mode = value['mode'];
  if (mode !== 'line_fallback' && mode !== 'transcript_only' && mode !== 'reject' && mode !== 'provided_value') {
    throw new TypeError('Prompt nonTty mode is unsupported.');
  }
  const diagnosticHint = optionalText(value['diagnosticHint'], 'Prompt nonTty diagnosticHint');
  if (mode === 'provided_value') {
    if (!Object.hasOwn(value, 'value')) throw new TypeError('Prompt provided_value policy must define value.');
    return Object.freeze({ mode, value: value['value'] as TValue, ...(diagnosticHint === undefined ? {} : { diagnosticHint }) });
  }
  if (Object.hasOwn(value, 'value') && value['value'] !== undefined) {
    throw new TypeError(`Prompt ${mode} policy cannot define value.`);
  }
  return Object.freeze({ mode, ...(diagnosticHint === undefined ? {} : { diagnosticHint }) });
}

function prepareChoiceSource<TValue>(value: unknown): PromptDataSource<TValue> {
  if (Array.isArray(value)) return prepareChoices<TValue>(value);
  if (typeof value !== 'function') throw new TypeError('Prompt choices must be an array or data source function.');
  const source = value as (query: PromptDataSourceQuery) => unknown;
  return async (query) => prepareChoiceResult<TValue>(await source(query), query.offset);
}

export function prepareChoiceResult<TValue>(value: unknown, offset = 0): PromptDataSourceResult<TValue> {
  if (!isNonArrayObject(value)) throw new TypeError('Prompt data source result must be an object.');
  const choices = prepareChoices<TValue>(value['choices']);
  const total = optionalNonNegativeSafeInteger(value['total'], 'Prompt data source total');
  if (total !== undefined && total < offset + choices.length) {
    throw new RangeError('Prompt data source total cannot be smaller than the returned choice window.');
  }
  const hasMore = value['hasMore'];
  if (hasMore !== undefined && typeof hasMore !== 'boolean') {
    throw new TypeError('Prompt data source hasMore must be a boolean when provided.');
  }
  const diagnostics = value['diagnostics'];
  if (diagnostics !== undefined && !Array.isArray(diagnostics)) {
    throw new TypeError('Prompt data source diagnostics must be an array when provided.');
  }
  return Object.freeze({
    choices,
    ...(total === undefined ? {} : { total }),
    ...(hasMore === undefined ? {} : { hasMore }),
    ...(diagnostics === undefined
      ? {}
      : { diagnostics: Object.freeze(diagnostics.map((entry) => adoptTerminalDiagnostic(entry))) }),
  });
}

function prepareChoices<TValue>(value: unknown): readonly PromptChoice<TValue>[] {
  if (!Array.isArray(value)) throw new TypeError('Prompt choices must be an array.');
  const ids = new Set<string>();
  return Object.freeze(value.map((entry, index) => {
    if (!isNonArrayObject(entry)) throw new TypeError(`Prompt choice at index ${String(index)} must be an object.`);
    const id = optionalNonEmptyText(entry['id'], `Prompt choice at index ${String(index)} id`);
    if (id !== undefined && ids.has(id)) throw new TypeError(`Prompt choice id ${JSON.stringify(id)} is duplicated.`);
    if (id !== undefined) ids.add(id);
    const label = requiredNonEmptyText(entry['label'], `Prompt choice at index ${String(index)} label`);
    if (!Object.hasOwn(entry, 'value')) throw new TypeError(`Prompt choice at index ${String(index)} must define value.`);
    const description = optionalText(entry['description'], `Prompt choice at index ${String(index)} description`);
    const disabled = entry['disabled'];
    if (disabled !== undefined && typeof disabled !== 'boolean' && typeof disabled !== 'string') {
      throw new TypeError(`Prompt choice at index ${String(index)} disabled must be a boolean or string.`);
    }
    const keywords = entry['keywords'];
    if (keywords !== undefined && (!Array.isArray(keywords) || keywords.some((keyword) => typeof keyword !== 'string'))) {
      throw new TypeError(`Prompt choice at index ${String(index)} keywords must be an array of strings.`);
    }
    return Object.freeze({
      ...(id === undefined ? {} : { id }),
      label,
      value: entry['value'] as TValue,
      ...(description === undefined ? {} : { description }),
      ...(disabled === undefined ? {} : {
        disabled: typeof disabled === 'string' ? sanitizeTerminalText(disabled).text : disabled,
      }),
      ...(keywords === undefined ? {} : {
        keywords: Object.freeze(keywords.map((keyword) => sanitizeTerminalText(keyword as string).text)),
      }),
    });
  }));
}

function prepareEditorCommand(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== 'string' || part.length === 0)) {
    throw new TypeError('Editor prompt editorCommand must be a non-empty array of non-empty strings.');
  }
  return Object.freeze(value.map((part) => part as string));
}
