import { defineComponent, span } from '@ismail-elkorchi/terminal-ui/component';

let preparations = 0;
let paints = 0;
const preparedLabels = new WeakMap();

const badge = defineComponent({
    structure: 'leaf', semantics: 'semantic',
  name: 'terminal-ui-peer-component-fixture/components/badge',
  identity: 'required',
  accessibleRole: 'status',
  retainPaint: true,
  async prepare({ model, signal, yield: yieldWork }) {
    signal.throwIfAborted();
    await yieldWork();
    signal.throwIfAborted();
    preparedLabels.set(model, model.label);
    preparations += 1;
  },
  createModel(value) {
    if (typeof value.label !== 'string') {
      throw new TypeError('peer badge requires a label.');
    }
    return Object.freeze({ label: value.label });
  },
  measure: ({ model }) => ({
    minWidth: 1,
    minHeight: 1,
    preferredWidth: model.label.length,
    preferredHeight: 1
  }),
  render: ({ model, target }) => {
    paints += 1;
    target.write(0, 0, [span(preparedLabels.get(model) ?? model.label)]);
  },
  accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label })
});

export function peerBadge(options) {
  return badge(options);
}

export function peerBadgeMetrics() { return { preparations, paints }; }
