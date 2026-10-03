import type { CommandCompletion, CommandSuggestion, CompleteListboxCollection, ListboxOption, ListboxOptionMapper, ListboxView } from '@ismail-elkorchi/terminal-ui/behavior';
import type { CollectionQuery } from '@ismail-elkorchi/terminal-ui/text';

export function createListboxFixture<T>(values: readonly T[], toOption: ListboxOptionMapper<T>, query?: CollectionQuery): {
  readonly collection: CompleteListboxCollection<T>;
  readonly view: ListboxView<T>;
};

export function createOptionsFixture<T extends ListboxOption>(values: readonly T[], query?: CollectionQuery): {
  readonly collection: CompleteListboxCollection<T>;
  readonly optionsView: ListboxView<T>;
};

export function createSuggestionFixture(values: readonly CommandSuggestion[]): {
  readonly suggestions: CompleteListboxCollection<CommandCompletion>;
  readonly suggestionView: ListboxView<CommandCompletion>;
};
