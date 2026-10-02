import { defineComponent, span } from '@ismail-elkorchi/terminal-ui/component';

let paints = 0;

const badge = defineComponent({
    structure: 'leaf', semantics: 'semantic',
  name: 'terminal-ui-peer-component-fixture/components/badge',
  identity: 'required',
  accessibleRole: 'status',
  retainPaint: true,
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
    target.write(0, 0, [span(model.label)]);
  },
  accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label })
});

export function peerBadge(options) {
  return badge(options);
}

export function peerBadgeMetrics() { return { paints }; }
