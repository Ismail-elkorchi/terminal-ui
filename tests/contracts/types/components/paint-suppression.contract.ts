import { checkbox, textInput } from '@ismail-elkorchi/terminal-ui/components/forms';
import { text } from '@ismail-elkorchi/terminal-ui/components/foundations';
import { defineComponent, ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';
import { column, portal, surface, type ElementMeta, type ElementPaint } from '@ismail-elkorchi/terminal-ui/layout';

const paint: ElementPaint = 'suppressed';
const meta = { paint } satisfies ElementMeta;
const native = textInput({ id: 'input', state: { text: '', cursor: 0 }, meta: { accessibleName: 'Input', paint }, onTransition: () => ignoreMessage() });
checkbox({ id: 'checkbox', label: 'Check', checked: false, meta, onTransition: () => ignoreMessage() });
text({ content: 'Text', meta });
column([surface(native, { meta }), portal(native, { anchor: { kind: 'allocation' }, placement: 'center', meta })], { meta });

const custom = defineComponent<{ readonly label: string }>()({
  name: 'contract/paint-suppression', identity: 'optional', structure: 'leaf', semantics: 'semantic', accessibleRole: 'status',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label }),
});
custom({ label: 'No metadata capability declaration', meta: { paint } });

// @ts-expect-error paint has a closed renderer-owned policy
text({ content: 'Invalid', meta: { paint: 'hidden' } });
// @ts-expect-error suppression is not a boolean
column([native], { meta: { paint: false } });
// @ts-expect-error descendants cannot explicitly override inherited suppression
custom({ label: 'Invalid', meta: { paint: 'visible' } });
