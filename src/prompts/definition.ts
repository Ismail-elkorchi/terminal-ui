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

export function confirm(options: ConfirmPromptOptions): ConfirmPromptDefinition {
  return { kind: 'confirm', ...promptDefinition(options) };
}

export function input(options: InputPromptOptions): InputPromptDefinition {
  return { kind: 'input', ...promptDefinition(options) };
}

export function password(options: PasswordPromptOptions): PasswordPromptDefinition {
  return {
    kind: 'password',
    ...promptDefinition(options),
    ...(options.mask === undefined ? {} : { mask: options.mask })
  };
}

export function select<TValue>(options: SelectPromptOptions<TValue>): SelectPromptDefinition<TValue> {
  return { kind: 'select', ...promptDefinition(options), choices: options.choices };
}

export function multiselect<TValue>(
  options: MultiSelectPromptOptions<TValue>
): MultiSelectPromptDefinition<TValue> {
  return {
    kind: 'multiselect',
    ...promptDefinition(options),
    choices: options.choices,
    ...(options.minSelected === undefined ? {} : { minSelected: options.minSelected }),
    ...(options.maxSelected === undefined ? {} : { maxSelected: options.maxSelected }),
    ...(options.rangeSelection === undefined ? {} : { rangeSelection: options.rangeSelection })
  };
}

export function autocomplete<TValue>(
  options: AutocompletePromptOptions<TValue>
): AutocompletePromptDefinition<TValue> {
  return {
    kind: 'autocomplete',
    ...promptDefinition(options),
    choices: options.choices,
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs })
  };
}

export function editor(options: EditorPromptOptions): EditorPromptDefinition {
  return {
    kind: 'editor',
    ...promptDefinition(options),
    ...(options.editorCommand === undefined ? {} : { editorCommand: options.editorCommand }),
    ...(options.editorAdapter === undefined ? {} : { editorAdapter: options.editorAdapter })
  };
}

export function progress(options: ProgressPromptOptions): ProgressPromptDefinition {
  return {
    kind: 'progress',
    ...promptDefinition({
      ...options,
      defaultValue: { completed: false },
      nonTty: options.nonTty ?? { mode: 'transcript_only' }
    }),
    ...(options.task === undefined ? {} : { progressTask: options.task }),
    progress: options.progress
  };
}

function promptDefinition<TValue>(
  options: BasePromptOptions<TValue>
): Omit<BasePromptOptions<TValue>, 'id'> & { readonly id?: string } {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    label: options.label,
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.defaultValue === undefined ? {} : { defaultValue: options.defaultValue }),
    ...(options.required === undefined ? {} : { required: options.required }),
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.nonTty === undefined ? {} : { nonTty: options.nonTty }),
    ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
    ...(options.validate === undefined ? {} : { validate: options.validate }),
    ...(options.render === undefined ? {} : { render: options.render }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}
