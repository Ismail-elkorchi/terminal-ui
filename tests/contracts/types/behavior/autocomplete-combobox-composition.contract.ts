import {
  autocompleteComboboxReducer,
  autocompleteComboboxView,
  commitAutocompleteCombobox,
  createAutocompleteComboboxState,
  createListboxCollection,
  createListboxView,
  createScrollState,
  type AutocompleteComboboxState,
  type AutocompleteComboboxTransition,
  type AutocompleteComboboxControlTransition,
  type AutocompleteComboboxView,
  type CreateAutocompleteComboboxStateInput,
  type ScrollableAutocompleteComboboxState,
  type ScrollableAutocompleteComboboxView,
  type UnscrolledAutocompleteComboboxState,
  type UnscrolledAutocompleteComboboxView,
} from '@ismail-elkorchi/terminal-ui/behavior';
import { combobox } from '@ismail-elkorchi/terminal-ui/components';
import type { Assert, Equal, MessageOf } from './behavior-state-and-view.contract.ts';

const collection = createListboxCollection([{ id: 'one', label: 'One' }], option => option);
const optionsView = createListboxView(collection);
const index = optionsView.interactionIndex;
const shared = { id: 'completion', label: 'Complete', collection, optionsView };
const reducerOptions = { indexForText: () => index };
const commitOptions = {
  ...reducerOptions,
  completionForId: () => ({ text: 'One', range: { startOffset: 0, endOffsetExclusive: 0 } }),
};
const unscrolled = createAutocompleteComboboxState({ open: true }, index);
const scrollable = createAutocompleteComboboxState({ open: true, scroll: createScrollState() }, index);
const reducedUnscrolled = autocompleteComboboxReducer(unscrolled, { kind: 'moveActive', delta: 1 }, reducerOptions);
const reducedScrollable = autocompleteComboboxReducer(scrollable, { kind: 'moveActive', delta: 1 }, reducerOptions);
const committedUnscrolled = commitAutocompleteCombobox(reducedUnscrolled, { kind: 'commit', id: 'one' }, commitOptions);
const committedScrollable = commitAutocompleteCombobox(reducedScrollable, { kind: 'commit', id: 'one' }, commitOptions);
const unscrolledView = autocompleteComboboxView(committedUnscrolled);
const scrollableView = autocompleteComboboxView(committedScrollable);
const unscrolledElement = combobox({
  ...shared,
  view: unscrolledView,
  onTransition: transition => ({ kind: 'transition', transition }),
  onCommit: event => ({ kind: 'commit', event }),
});
const scrollableElement = combobox({
  ...shared,
  view: scrollableView,
  scrollbar: { visible: 'auto' },
  onTransition: transition => ({ kind: 'transition', transition }),
  onCommit: event => ({ kind: 'commit', event }),
});

// Application model annotations deliberately erase the concrete scroll mode.
declare const broadState: AutocompleteComboboxState;
declare const broadInput: CreateAutocompleteComboboxStateInput;
const constructedBroad = createAutocompleteComboboxState(broadInput, index);
const reducedBroad = autocompleteComboboxReducer(broadState, { kind: 'open' }, reducerOptions);
const committedBroad = commitAutocompleteCombobox(reducedBroad, { kind: 'commit', id: 'one' }, commitOptions);
const broadView = autocompleteComboboxView(committedBroad);
const broadElement = combobox({
  ...shared,
  view: broadView,
  onTransition: transition => ({ kind: 'transition', transition }),
  onCommit: event => ({ kind: 'commit', event }),
});

export type _ConstructorUnscrolled = Assert<Equal<typeof unscrolled, UnscrolledAutocompleteComboboxState>>;
export type _ConstructorScrollable = Assert<Equal<typeof scrollable, ScrollableAutocompleteComboboxState>>;
export type _ReducerUnscrolled = Assert<Equal<typeof reducedUnscrolled, UnscrolledAutocompleteComboboxState>>;
export type _ReducerScrollable = Assert<Equal<typeof reducedScrollable, ScrollableAutocompleteComboboxState>>;
export type _CommitUnscrolled = Assert<Equal<typeof committedUnscrolled, UnscrolledAutocompleteComboboxState>>;
export type _CommitScrollable = Assert<Equal<typeof committedScrollable, ScrollableAutocompleteComboboxState>>;
export type _ViewUnscrolled = Assert<Equal<typeof unscrolledView, UnscrolledAutocompleteComboboxView>>;
export type _ViewScrollable = Assert<Equal<typeof scrollableView, ScrollableAutocompleteComboboxView>>;
export type _ConstructorBroad = Assert<Equal<typeof constructedBroad, AutocompleteComboboxState>>;
export type _ReducerBroad = Assert<Equal<typeof reducedBroad, AutocompleteComboboxState>>;
export type _CommitBroad = Assert<Equal<typeof committedBroad, AutocompleteComboboxState>>;
export type _ViewBroad = Assert<Equal<typeof broadView, AutocompleteComboboxView>>;
export type _UnscrolledTransition = Assert<Equal<Extract<MessageOf<typeof unscrolledElement>, { kind: 'transition' }>['transition'], AutocompleteComboboxControlTransition>>;
export type _ScrollableTransition = Assert<Equal<Extract<MessageOf<typeof scrollableElement>, { kind: 'transition' }>['transition'], AutocompleteComboboxTransition>>;
export type _BroadTransition = Assert<Equal<Extract<MessageOf<typeof broadElement>, { kind: 'transition' }>['transition'], AutocompleteComboboxTransition>>;

// @ts-expect-error Unscrolled states cannot consume scroll transitions.
autocompleteComboboxReducer(unscrolled, { kind: 'scroll', request: { nextState: createScrollState(), source: 'wheel', target: 'content' } }, reducerOptions);
// @ts-expect-error Scrollbars require a view with a guaranteed scroll capability.
combobox({ ...shared, view: unscrolledView, scrollbar: { visible: 'auto' }, onTransition: () => ({ kind: 'transition' }) });
// @ts-expect-error A broad model cannot promise that a scroll state is present.
combobox({ ...shared, view: broadView, scrollbar: { visible: 'auto' }, onTransition: () => ({ kind: 'transition' }) });
// @ts-expect-error A broad view requires a callback that also accepts scroll transitions.
combobox({ ...shared, view: broadView, onTransition: (transition: AutocompleteComboboxControlTransition) => ({ kind: 'transition', transition }) });
// @ts-expect-error Scrollable views require callbacks that accept scroll transitions.
combobox({ ...shared, view: scrollableView, onTransition: (transition: AutocompleteComboboxControlTransition) => ({ kind: 'transition', transition }) });

// Existing explicitly supplied application message unions remain valid.
type AppMessage = { readonly kind: 'transition' } | { readonly kind: 'commit' };
combobox<{ id: string; label: string }, AppMessage>({
  ...shared,
  view: unscrolledView,
  onTransition: () => ({ kind: 'transition' }),
  onCommit: () => ({ kind: 'commit' }),
});

declare const annotatedOptions: import('@ismail-elkorchi/terminal-ui/components/forms').AutocompleteComboboxOptions<string, AppMessage>;
combobox(annotatedOptions);
