import { combobox } from '@ismail-elkorchi/terminal-ui/components/forms';
import { createListboxCollection, createListboxView } from '@ismail-elkorchi/terminal-ui/behavior';

const collection = createListboxCollection([{ id: 'one', label: 'One' }], option => option);
const shared = {
  id: 'choice',
  label: 'Choice',
  collection,
  optionsView: createListboxView(collection),
  onTransition: () => ({ kind: 'transition' as const }),
};
const state = { kind: 'select' as const, open: false, interaction: { selection: { mode: 'single' as const } } };
const view = { kind: 'autocomplete' as const, open: false, input: { text: '', cursor: 0 }, selection: { mode: 'single' as const } };

combobox({ ...shared, state, labelVisibility: 'visible' });
combobox({ ...shared, state, labelVisibility: 'hidden' });
combobox({ ...shared, view, labelVisibility: 'hidden' });
combobox({ ...shared, state: { ...state, open: false }, disabled: true, labelVisibility: 'hidden' });
combobox({ ...shared, view, inert: true, labelVisibility: 'hidden' });

// @ts-expect-error label visibility is a closed policy
combobox({ ...shared, state, labelVisibility: 'none' });
// @ts-expect-error hiding the visible prefix does not make the accessible label optional
combobox({ id: 'missing-label', collection, optionsView: null, state, labelVisibility: 'hidden', onTransition: shared.onTransition });
// @ts-expect-error autocomplete also requires its accessible label when hidden
combobox({ id: 'missing-autocomplete-label', collection, optionsView: null, view, labelVisibility: 'hidden', onTransition: shared.onTransition });
