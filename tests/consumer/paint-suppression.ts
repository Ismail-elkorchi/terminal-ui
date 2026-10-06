import {
  checkbox, column, image,
  overlay, portal, surface, text, textInput,
  type ElementPaint,
} from '@ismail-elkorchi/terminal-ui';
import { defineComponent, ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';
import { rasterImage } from '@ismail-elkorchi/terminal-ui/graphics';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import { peerBadge, peerBadgeMetrics } from 'terminal-ui-peer-component-fixture';

const paint: ElementPaint = 'suppressed';
const meta = { paint };
const native = column([
  text({ content: 'Native text', meta }),
  textInput({ id: 'input', meta: { accessibleName: 'Input', paint },
    state: { text: 'Value', cursor: 5 }, onTransition: () => ignoreMessage() }),
  checkbox({ id: 'check', label: 'Native checkbox', checked: false, meta, onTransition: () => ignoreMessage() }),
  image({ id: 'image', label: 'Native image', meta,
    image: rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([0, 0, 0]) }),
    measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 } }),
], { meta });

const custom = defineComponent<{ readonly label: string }>()({
  name: 'packed-consumer/paint-suppression', identity: 'optional', structure: 'leaf', semantics: 'semantic', accessibleRole: 'status',
  measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 1 }),
  render: () => { throw new Error('Suppressed custom paint hook ran.'); },
  accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label }),
});
const customHidden = custom({ label: 'Custom metadata without opt-in', meta });

// @ts-expect-error paint suppression is an explicit policy, not a boolean
const invalidBoolean: ElementPaint = false;
// @ts-expect-error descendants cannot request an override that reenables painting
const invalidVisible: ElementPaint = 'visible';
void invalidBoolean; void invalidVisible;

export function verifyPaintSuppression(): void {
  const before = peerBadgeMetrics().paints;
  const element = overlay([
    native,
    customHidden,
    surface(portal(peerBadge({ id: 'peer-hidden', label: 'Suppressed peer', meta }), {
      anchor: { kind: 'allocation' }, placement: 'center',
      meta: { layer: { zIndex: 20, underlay: 'clear', backdrop: 'viewport' } },
    }), { meta }),
  ]);
  const frame = renderElementFrame(element, { columns: 24, rows: 6 });
  if (renderFramePlain(frame).trim() !== '' || frame.graphics.length !== 0 || frame.cursor !== undefined) {
    throw new Error('Packed paint suppression emitted visual output.');
  }
  if (peerBadgeMetrics().paints !== before) throw new Error('Packed peer paint hook ignored suppression.');
  if (!JSON.stringify(frame.accessibility).includes('Suppressed peer')) {
    throw new Error('Packed paint suppression removed peer semantics.');
  }
}
