import {
  autocompleteComboboxReducer,
  autocompleteComboboxView,
  commitAutocompleteCombobox,
  createAutocompleteComboboxState,
  createListboxCollection,
  createListboxView,
  createScrollState,
  type AutocompleteComboboxState,
} from '@ismail-elkorchi/terminal-ui/behavior';
import { combobox } from '@ismail-elkorchi/terminal-ui/components/forms';

const collection = createListboxCollection([{ id: 'one', label: 'One' }], option => option);
const optionsView = createListboxView(collection);
const options = { indexForText: () => optionsView.interactionIndex };
const shared = { id: 'completion', label: 'Complete', collection, optionsView };

function renderBroadState(state: AutocompleteComboboxState) {
  return combobox({
    ...shared,
    view: autocompleteComboboxView(state),
    onTransition: transition => ({ kind: 'transition', transition }),
    onCommit: event => ({ kind: 'commit', event }),
    onContextMenu: event => ({ kind: 'context', event }),
  });
}

export function verifyAutocompleteComposition(): void {
  const initial = createAutocompleteComboboxState({ open: true }, optionsView.interactionIndex);
  const updated = autocompleteComboboxReducer(initial, { kind: 'setText', value: 'One' }, options);
  const committed = commitAutocompleteCombobox(updated, { kind: 'commit', id: 'one' }, {
    ...options,
    completionForId: (_id, input) => ({
      text: 'One',
      range: { startOffset: 0, endOffsetExclusive: input.text.length },
    }),
  });
  combobox({
    ...shared,
    view: autocompleteComboboxView(committed),
    onTransition: transition => ({ kind: 'transition', transition }),
    onCommit: event => ({ kind: 'commit', event }),
  });
  const scrolling = createAutocompleteComboboxState({ open: true, scroll: createScrollState() }, optionsView.interactionIndex);
  const scrolled = autocompleteComboboxReducer(scrolling, { kind: 'scroll', request: {
    nextState: createScrollState({ offsetRow: 1 }), source: 'wheel', target: 'content',
  } }, options);
  combobox({
    ...shared,
    view: autocompleteComboboxView(scrolled),
    scrollbar: { visible: 'auto' },
    onTransition: transition => ({ kind: 'transition', transition }),
    onCommit: event => ({ kind: 'commit', event }),
  });
  renderBroadState(committed);
  renderBroadState(scrolled);
  if (committed.scroll !== undefined || scrolled.scroll.offsetRow !== 1) {
    throw new Error('Autocomplete transitions did not preserve the scroll mode.');
  }
}
