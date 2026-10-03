import { createCommandSuggestions, createListboxCollection, createListboxView } from '../../dist/behavior/index.js';

/** Build an owned source and its matching projection for a small test fixture. */
export function createListboxFixture(values, toOption, query) {
  const collection = createListboxCollection(values, toOption);
  const view = createListboxView(collection, query === undefined ? {} : { query });
  return { collection, view };
}

/** Build the option source/projection used by a popup control fixture. */
export function createOptionsFixture(values, query) {
  const { collection, view } = createListboxFixture(values, value => value, query);
  return { collection, optionsView: view };
}

/** Retain command completions alongside their prepared suggestion projection. */
export function createSuggestionFixture(values) {
  const suggestions = createCommandSuggestions(values);
  return { suggestions, suggestionView: createListboxView(suggestions) };
}
