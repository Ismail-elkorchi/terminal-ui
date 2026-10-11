import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';
import { button, inspectElement } from '@ismail-elkorchi/terminal-ui/components';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';
import { keyInput } from '@ismail-elkorchi/terminal-ui/testing';
import { createTuiRuntime, defineTui } from '@ismail-elkorchi/terminal-ui/tui';

function invariant(condition, message) { if (!condition) throw new Error(message); }
const semantic = {
  name: 'packed-contracts/output', identity: 'required', semantics: 'semantic', accessibleRole: 'group',
  accessibility: ({ id, children }) => ({ id, children }),
};
for (const structure of ['composed', 'composite']) {
  let mappings = 0;
  const child = ({ emit }) => button({ id: 'child', label: 'Run', onPress: () => emit('activate') });
  const factory = defineComponent({
    ...semantic, structure, emitsActions: true,
    ...(structure === 'composed' ? { compose: child } : {
      slots: { content: { owner: 'implementation', cardinality: 'one', messages: 'bubble' } },
      implementationSlots: input => ({ content: child(input) }),
      measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 8, preferredHeight: 1 }),
      layout: ({ bounds }) => ({ content: bounds }),
    }),
  });
  const view = () => factory({ id: 'owner', onAction: action => { mappings += 1; return action; } });
  const runtime = createTuiRuntime({
    host: createMemoryTerminalHost(),
    app: defineTui({ init: () => ({ state: [] }), update: (state, message) => ({ state: [...state, message] }), view }),
  });
  try {
    await runtime.start();
    await runtime.handleInput(keyInput('enter'));
    invariant(runtime.state().join(',') === 'activate', `${structure} lost emitted action`);
    invariant(mappings === 1, `${structure} mapped the emitted action more than once`);
    invariant(runtime.frame().accessibility.root.role === 'group', 'root role was not injected');
    invariant(runtime.frame().accessibility.root.children[0].role === 'button', 'descendant role changed');
    invariant(inspectElement(view()).component.accessibleRole === 'group', 'inspection role disagreed');
  } finally { await runtime.dispose(); }
}
for (const role of ['group', 'button']) {
  const malformed = defineComponent({
    ...semantic, structure: 'leaf',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {}, accessibility: ({ id }) => ({ id, role }),
  });
  let rejected = false;
  try { renderElementFrame(malformed({ id: 'malformed' }), { columns: 8, rows: 1 }); }
  catch (error) { rejected = error instanceof Error && /role/iu.test(error.message); }
  invariant(rejected, `callback root role ${role} was accepted`);
}
console.log(JSON.stringify({ scenario: 'component-output-contracts', status: 'passed' }));
