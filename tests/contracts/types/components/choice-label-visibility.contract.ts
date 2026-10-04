import { checkboxGroup, radioGroup } from '@ismail-elkorchi/terminal-ui/components/forms';

const common = { id: 'choice', label: 'Choice', options: [{ id: 'one', label: 'One', value: 1 }],
  labelVisibility: 'hidden' as const, onTransition: () => ({ kind: 'choice' as const }) };
const single = { selection: { mode: 'single' as const, selectedId: 'one' } };
const multiple = { selection: { mode: 'multiple' as const, selectedIds: ['one'] } };
radioGroup({ ...common, state: single });
checkboxGroup({ ...common, state: multiple });
radioGroup({ ...common, state: single, disabled: true });
checkboxGroup({ ...common, state: multiple, labelVisibility: 'visible' });
// @ts-expect-error label visibility is a closed policy
radioGroup({ ...common, state: single, labelVisibility: 'none' });
// @ts-expect-error the accessible label remains mandatory
checkboxGroup({ id: 'choice', options: common.options, state: multiple, labelVisibility: 'hidden', onTransition: common.onTransition });
