import { createAccessibleSnapshot, decodeAccessibleSnapshot } from '@ismail-elkorchi/terminal-ui/accessibility';
import { text } from '@ismail-elkorchi/terminal-ui/components';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';

const frame = renderElementFrame(text({ content: 'Portable renderer' }), { columns: 24, rows: 2 });
const plain = renderFramePlain(frame);
const snapshot = createAccessibleSnapshot({
  source: 'renderer',
  root: {
    id: 'root',
    role: 'listbox',
    window: { startIndex: 0, endIndexExclusive: 1, totalCount: 1 },
    children: [{
      id: 'item',
      role: 'option',
      label: 'Portable renderer',
      position: { positionInSet: 1, setSize: 1 }
    }]
  }
});
const validation = decodeAccessibleSnapshot(snapshot);

invariant(plain.includes('Portable renderer'), 'plain rendering failed');
invariant(frame.accessibility.source === 'renderer', 'direct renderer snapshot source was not renderer');
invariant(validation.ok, 'accessibility validation failed');

console.log(JSON.stringify({ scenario: 'renderer-accessibility', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
