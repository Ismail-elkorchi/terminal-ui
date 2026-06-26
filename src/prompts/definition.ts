import type {
  AutocompletePromptOptions,
  BasePromptOptions,
  ConfirmPromptOptions,
  EditorPromptOptions,
  InputPromptOptions,
  MultiSelectPromptOptions,
  PasswordPromptOptions,
  PromptProgressState,
  ProgressPromptOptions,
  ProgressResult,
  PromptDataSource,
  PromptDefinition,
  PromptKind,
  SelectPromptOptions
} from './types.ts';

export function confirm(options: ConfirmPromptOptions): PromptDefinition<boolean> {
  return promptDefinition('confirm', options);
}

export function input(options: InputPromptOptions): PromptDefinition<string> {
  return promptDefinition('input', options);
}

export function password(options: PasswordPromptOptions): PromptDefinition<string> {
  return {
    ...promptDefinition('password', options),
    ...(options.mask === undefined ? {} : { mask: options.mask })
  };
}

export function select<TValue>(options: SelectPromptOptions<TValue>): PromptDefinition<TValue> {
  return promptDefinition('select', options, options.choices);
}

export function multiselect<TValue>(
  options: MultiSelectPromptOptions<TValue>
): PromptDefinition<readonly TValue[]> {
  const definition = promptDefinition('multiselect', options, options.choices);
  return {
    ...definition,
    ...(options.minSelected === undefined ? {} : { minSelected: options.minSelected }),
    ...(options.maxSelected === undefined ? {} : { maxSelected: options.maxSelected }),
    ...(options.rangeSelection === undefined ? {} : { rangeSelection: options.rangeSelection })
  };
}

export function autocomplete<TValue>(options: AutocompletePromptOptions<TValue>): PromptDefinition<TValue> {
  return {
    ...promptDefinition('autocomplete', options, options.choices),
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs })
  };
}

export function editor(options: EditorPromptOptions): PromptDefinition<string> {
  return {
    ...promptDefinition('editor', options),
    ...(options.editorCommand === undefined ? {} : { editorCommand: options.editorCommand }),
    ...(options.editorAdapter === undefined ? {} : { editorAdapter: options.editorAdapter })
  };
}

export function progress(options: ProgressPromptOptions): PromptDefinition<ProgressResult> {
  return {
    ...promptDefinition('progress', {
      ...options,
      defaultValue: { completed: false },
      nonTty: options.nonTty ?? { mode: 'transcript_only' }
    }),
    ...(options.task === undefined ? {} : { progressTask: options.task }),
    ...progressState(options)
  };
}

function progressState(options: ProgressPromptOptions): { readonly progress?: PromptProgressState } {
  const state: PromptProgressState = {
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.indeterminate === undefined ? {} : { indeterminate: options.indeterminate })
  };
  return Object.keys(state).length === 0 ? {} : { progress: state };
}

function promptDefinition<TValue>(
  kind: PromptKind,
  options: BasePromptOptions<TValue>,
  choices?: PromptDataSource<unknown>
): PromptDefinition<TValue> {
  return {
    kind,
    ...(options.id === undefined ? {} : { id: options.id }),
    label: options.label,
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(choices === undefined ? {} : { choices }),
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
